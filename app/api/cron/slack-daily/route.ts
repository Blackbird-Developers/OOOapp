import { NextResponse } from "next/server";
import { isWeekend, parseISO } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDayAvailability } from "@/lib/whos-off";
import { buildDailyDigest, postToSlack } from "@/lib/slack";
import { loadSlackSettings } from "@/lib/slack-settings";
import { APP_TIME_ZONE, hourNowIn, todayISOIn } from "@/lib/days";

export const dynamic = "force-dynamic";

/**
 * How many hours, counting the target itself, the digest may still go out in.
 *
 * The endpoint runs hourly, so without a ceiling a morning that was quiet at
 * 06:00 would post "out of office today" the moment somebody logged leave that
 * afternoon. Three keeps the digest a morning thing while leaving two spare
 * runs for a late trigger or a failed post. A target near midnight simply gets
 * a shorter window — the window never wraps into tomorrow, which would post
 * yesterday's digest under today's date.
 */
const POST_WINDOW_HOURS = 3;

/**
 * Daily out-of-office digest → Slack.
 *
 * Scheduled hourly in vercel.json, every day. The schedule is deliberately
 * dumber than the behaviour: which hour to post, whether weekends count and
 * whether to speak on a quiet day are all integration settings an admin edits
 * at /admin/integrations, and the runs that fall outside them cost one cheap
 * skip each. An hourly cron is what lets those settings mean what they say —
 * with a fixed 04:00/05:00 UTC schedule, any post hour past ~06:00 local would
 * silently never fire and turning weekends on would do nothing.
 *
 * Vercel Cron runs in UTC and Kosovo changes offset twice a year; running every
 * hour and comparing against the local clock sidesteps that entirely, so there
 * is no CET/CEST special-casing and no timezone library.
 *
 * `slack_daily_posts` is what keeps this to one message a day: the first run to
 * post claims the date, and every later run that day is a no-op.
 */
export async function GET(req: Request) {
  const denied = rejectIfUnauthorised(req);
  if (denied) return denied;

  const settings = await loadSlackSettings();
  const dateISO = todayISOIn();
  const localHour = hourNowIn();

  if (settings.weekdaysOnly && isWeekend(parseISO(dateISO))) {
    return skipped(dateISO, "weekend");
  }

  // Vercel fires crons within the hour of their slot, so treat the target as a
  // floor rather than an exact match — otherwise a late trigger loses the day.
  if (localHour < settings.postHour) {
    return skipped(
      dateISO,
      `too early (${localHour}:00 ${APP_TIME_ZONE}, posts from ${settings.postHour}:00)`
    );
  }

  // ...and a ceiling, so that hourly scheduling buys any post hour without also
  // turning an afternoon leave request into an afternoon digest.
  const windowEnd = settings.postHour + POST_WINDOW_HOURS - 1;
  if (localHour > windowEnd) {
    return skipped(
      dateISO,
      `too late (${localHour}:00 ${APP_TIME_ZONE}, window was ${settings.postHour}:00–${windowEnd}:00)`
    );
  }

  if (!settings.connected) {
    return NextResponse.json(
      { ok: false, date: dateISO, error: "Slack isn't connected." },
      { status: 503 }
    );
  }

  const supabase = createAdminClient();
  const day = await getDayAvailability(supabase, dateISO);

  if (settings.silentWhenEmpty && !day.holiday && day.people.length === 0) {
    return skipped(dateISO, "nobody off");
  }

  // Claim the day before posting. The primary key on post_date is what makes
  // the second cron run — or a retry, or a redelivery — a no-op instead of a
  // duplicate message.
  const channel = settings.channel!;
  const { error: claimError } = await supabase
    .from("slack_daily_posts")
    .insert({ post_date: dateISO, channel, people_count: day.people.length });

  if (claimError) {
    if (claimError.code === "23505") return skipped(dateISO, "already posted");
    console.error("[cron/slack-daily] could not claim the day:", claimError);
    return NextResponse.json({ ok: false, date: dateISO, error: claimError.message }, { status: 500 });
  }

  try {
    await postToSlack(buildDailyDigest(day, { shareHalfDays: settings.shareHalfDays }));
  } catch (err) {
    // Release the claim so the next run — or a manual retry — can try again.
    await supabase.from("slack_daily_posts").delete().eq("post_date", dateISO);
    const message = err instanceof Error ? err.message : "Slack post failed.";
    console.error("[cron/slack-daily] post failed, claim released:", message);
    return NextResponse.json({ ok: false, date: dateISO, error: message }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    posted: true,
    date: dateISO,
    people: day.people.length,
    holiday: day.holiday?.name ?? null,
  });
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

function skipped(date: string, reason: string) {
  return NextResponse.json({ ok: true, posted: false, date, reason });
}
