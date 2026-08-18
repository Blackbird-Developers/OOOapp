import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { getDayAvailability } from "@/lib/whos-off";
import { buildDailyDigest, isSlackConfigured, postToSlack } from "@/lib/slack";
import { todayISOIn } from "@/lib/days";

export const dynamic = "force-dynamic";

/**
 * Post today's digest to Slack right now, on an admin's say-so.
 *
 * Exists so the channel wiring can be verified without waiting until 09:00
 * tomorrow. Unlike the cron it ignores the hour gate and the once-a-day claim,
 * and it posts even on a quiet day — an "everyone's in" message is still proof
 * the token, channel and permissions are right.
 */
export async function POST() {
  await requireAdmin();

  if (!isSlackConfigured()) {
    return NextResponse.json(
      { error: "Slack isn't configured yet. Set SLACK_BOT_TOKEN and SLACK_CHANNEL_ID." },
      { status: 503 }
    );
  }

  const supabase = await createServerClient();
  const day = await getDayAvailability(supabase, todayISOIn());

  try {
    await postToSlack(buildDailyDigest(day));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Slack post failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, people: day.people.length });
}
