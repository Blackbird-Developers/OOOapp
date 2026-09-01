import { NextResponse } from "next/server";
import { isWeekend, parseISO } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDayAvailability } from "@/lib/whos-off";
import { buildDailyDigest, postToSlack } from "@/lib/slack";
import { loadSlackSettings } from "@/lib/slack-settings";
import { APP_TIME_ZONE, hourNowIn, todayISOIn } from "@/lib/days";

export const dynamic = "force-dynamic";

/**
 * Daily out-of-office digest → Slack.
 *
 * Scheduled twice in vercel.json (04:00 and 05:00 UTC) so that 06:00 Kosovo
 * time is covered in both CEST (UTC+2, so the 04:00 run lands on it) and CET
 * (UTC+1, so the 05:00 run does). Whichever run first finds the local clock at
 * or past the target hour does the post; `slack_daily_posts` makes every later
 * run for the same date a no-op.
 *
 * The hour, the weekday rule and the quiet-day rule all come from the
 * integration settings an admin edits at /admin/integrations. Moving the post
 * time later than the last cron slot is the one change that won't take effect
 * on its own — see the note on the hour gate below.
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
  // The corollary: a target hour later than the last scheduled slot never
  // fires, so vercel.json needs a slot at or after it.
  if (localHour < settings.postHour) {
    return skipped(
      dateISO,
      `too early (${localHour}:00 ${APP_TIME_ZONE}, posts from ${settings.postHour}:00)`
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
