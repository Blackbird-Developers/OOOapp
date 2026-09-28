import { NextResponse } from "next/server";
import { isWeekend, parseISO } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDayAvailability } from "@/lib/whos-off";
import { buildDailyDigest, postToSlack } from "@/lib/slack";
import { loadSlackSettings } from "@/lib/slack-settings";
import { APP_TIME_ZONE, hourNowIn, todayISOIn } from "@/lib/days";
import { POST_WINDOW_HOURS } from "@/lib/slack-schedule";

export const dynamic = "force-dynamic";

/**
 * Daily out-of-office digest → Slack.
 *
 * Scheduled in vercel.json at 04:00 and 05:00 UTC — two runs a day, every day
 * of the week, which is all the Vercel Hobby plan allows. Kosovo is UTC+1 in
 * winter and UTC+2 in summer, so those land at 05:00/06:00 or 06:00/07:00
 * local; comparing against the local clock rather than hard-coding an offset
 * is what covers both without a timezone library.
 *
 * The rules themselves come from the integration settings an admin edits at
 * /admin/integrations, and runs that fall outside them cost one cheap skip.
 * The schedule still bounds one of those settings: only the post hours in
 * `servablePostHours()` can actually be reached, which is why the dropdown
 * offers exactly those and no more. Widening the cron widens the dropdown —
 * see lib/slack-schedule.ts.
 *
 * Running every day rather than Mon-Fri is deliberate: the weekday rule is now
 * a setting, so it belongs in the code where it can be switched off, not baked
 * into a schedule that can only be changed by a redeploy.
 *
 * Runs once per company, each against its own settings and channel.
 * `slack_daily_posts` is what keeps this to one message a day per company: the
 * first run to post claims the date, and every later run that day is a no-op.
 */
export async function GET(req: Request) {
  const denied = rejectIfUnauthorised(req);
  if (denied) return denied;

  const supabase = createAdminClient();
  const dateISO = todayISOIn();

  // Each company has its own Slack settings, so each gets its own run. Most
  // have Slack switched off and cost one settings read.
  const { data: orgs, error } = await supabase.from("organizations").select("id");
  if (error) {
    console.error("[cron/slack-daily] could not list organizations:", error);
    return NextResponse.json({ ok: false, date: dateISO, error: error.message }, { status: 500 });
  }

  const results: OrgResult[] = [];
  for (const org of orgs ?? []) {
    results.push({ organization: org.id, ...(await runFor(org.id, dateISO)) });
  }

  const failed = results.some((r) => !r.ok);
  return NextResponse.json({ ok: !failed, date: dateISO, results }, { status: failed ? 500 : 200 });
}

type RunResult =
  | { ok: true; posted: false; reason: string }
  | { ok: true; posted: true; people: number; holiday: string | null }
  | { ok: false; error: string };

type OrgResult = RunResult & { organization: string };

async function runFor(orgId: string, dateISO: string): Promise<RunResult> {
  const settings = await loadSlackSettings(orgId);
  const localHour = hourNowIn();

  if (!settings.connected) return skipped("Slack isn't connected");

  if (settings.weekdaysOnly && isWeekend(parseISO(dateISO))) {
    return skipped("weekend");
  }

  if (localHour < settings.postHour) {
    return skipped(`too early (${localHour}:00 ${APP_TIME_ZONE}, posts from ${settings.postHour}:00)`);
  }

  const windowEnd = settings.postHour + POST_WINDOW_HOURS - 1;
  if (localHour > windowEnd) {
    return skipped(
      `too late (${localHour}:00 ${APP_TIME_ZONE}, window was ${settings.postHour}:00–${windowEnd}:00)`
    );
  }

  const supabase = createAdminClient();
  const day = await getDayAvailability(supabase, orgId, dateISO);

  if (settings.silentWhenEmpty && !day.holiday && day.people.length === 0) {
    return skipped("nobody off");
  }

  const channel = settings.channel!;
  const { error: claimError } = await supabase
    .from("slack_daily_posts")
    .insert({ organization_id: orgId, post_date: dateISO, channel, people_count: day.people.length });

  if (claimError) {
    if (claimError.code === "23505") return skipped("already posted");
    console.error(`[cron/slack-daily] ${orgId}: could not claim the day:`, claimError);
    return { ok: false, error: claimError.message };
  }

  try {
    await postToSlack(orgId, buildDailyDigest(day, { shareHalfDays: settings.shareHalfDays }));
  } catch (err) {
    await supabase
      .from("slack_daily_posts")
      .delete()
      .eq("organization_id", orgId)
      .eq("post_date", dateISO);
    const message = err instanceof Error ? err.message : "Slack post failed.";
    console.error(`[cron/slack-daily] ${orgId}: post failed, claim released:`, message);
    return { ok: false, error: message };
  }

  return { ok: true, posted: true, people: day.people.length, holiday: day.holiday?.name ?? null };
}

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that variable is
 * set on the project. Without the check, anyone who found the URL could make
 * the bot post — so a missing secret is a hard failure in production rather
 * than an open door.
 */
function rejectIfUnauthorised(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[cron/slack-daily] CRON_SECRET is not set; refusing to run.");
      return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 503 });
    }
    return null; // local development
  }

  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }
  return null;
}

function skipped(reason: string): RunResult {
  return { ok: true, posted: false, reason };
}
