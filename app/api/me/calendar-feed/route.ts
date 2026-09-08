import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getOrCreateFeedToken, regenerateFeedToken } from "@/lib/calendar";
import { loadCalendarSettings } from "@/lib/calendar-settings";

export const dynamic = "force-dynamic";

/**
 * The caller's own calendar subscription URL.
 *
 * Always scoped to `requireUser()` — there is no way to ask for somebody
 * else's feed, because the id is never taken from the request. That matters
 * more here than in most routes: the URL this returns is a bearer credential
 * for one person's leave, so handing it to the wrong caller would be handing
 * over the data itself.
 */

function feedUrl(token: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${site.replace(/\/$/, "")}/api/calendar/${token}`;
}

/** Fetch the URL, minting a token the first time it is asked for. */
export async function GET() {
  const me = await requireUser();

  const settings = await loadCalendarSettings();
  if (!settings.connected || !settings.personalFeeds) {
    return NextResponse.json({ enabled: false, url: null });
  }

  const token = await getOrCreateFeedToken(me.id);
  if (!token) {
    return NextResponse.json({ error: "Could not prepare your calendar feed." }, { status: 500 });
  }

  return NextResponse.json({ enabled: true, url: feedUrl(token) });
}

/**
 * Mint a new token, which instantly breaks every copy of the old URL.
 *
 * The way out if a feed URL is pasted somewhere it shouldn't be. Subscriptions
 * using the old link stop updating rather than erroring loudly, so the UI has
 * to say plainly that re-subscribing is required.
 */
export async function POST() {
  const me = await requireUser();

  const settings = await loadCalendarSettings();
  if (!settings.connected || !settings.personalFeeds) {
    return NextResponse.json({ error: "Calendar feeds are switched off." }, { status: 400 });
  }

  const token = await regenerateFeedToken(me.id);
  if (!token) {
    return NextResponse.json({ error: "Could not create a new link." }, { status: 500 });
  }

  return NextResponse.json({ url: feedUrl(token) });
}
