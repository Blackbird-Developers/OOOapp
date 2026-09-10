import { feedUrl } from "@/lib/calendar";
import { loadCalendarSettings } from "@/lib/calendar-settings";

/**
 * One click, from anywhere, into the right calendar app.
 *
 * Exists because the alternative does not survive email. Apple needs a
 * `webcal://` URL and Google and Microsoft each need a URL of their own shape,
 * and none of those can be put in an anchor in an email: mail clients sanitise
 * schemes they do not recognise, and rewrite the ones they do. Gmail in
 * particular drops a `webcal://` href entirely, which is why the "Add to Apple
 * Calendar" button worked on the account page and did nothing in the approval
 * email.
 *
 * So every button points here instead — a plain https link on this app's own
 * domain, which every mail client passes through untouched — and the redirect
 * to the vendor happens after the click, where no sanitiser is involved.
 *
 * Keeping the vendor URL formats here rather than in the browser bundle has a
 * second benefit: they are wrong often enough (Microsoft alone has two hosts)
 * that having one server-side place to correct them beats having them compiled
 * into emails that have already been sent.
 *
 * Unauthenticated, exactly like the feed it points at: a person clicking this
 * from their phone's mail app has no session. The token in the path is the
 * credential, and it is only ever handed straight back to a calendar.
 */

export const dynamic = "force-dynamic";

/**
 * What the subscribed calendar is called in the app that receives it.
 *
 * Deliberately not the person's name, which would cost a database read on
 * every click to say something the owner of the calendar already knows. Apple
 * and Google ignore this and read `X-WR-CALNAME` out of the feed itself, where
 * the name does appear; only Microsoft takes it from the URL.
 */
const CALENDAR_NAME = "Blackbird Leave - Out of office";

function targetFor(app: string, feed: string): string | null {
  // Apple and Google want the webcal form; Microsoft wants the https one.
  const webcal = feed.replace(/^https?:/i, "webcal:");

  switch (app) {
    // Handed straight to Calendar by macOS and iOS.
    case "apple":
      return webcal;

    // Google shows its own confirmation screen before subscribing.
    case "google":
      return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;

    // Microsoft 365 work or school accounts — which is also what Teams shows,
    // because Teams has no calendar of its own and renders this one.
    case "outlook":
      return addFromWeb("https://outlook.office.com", feed);

    // Personal @outlook.com / @hotmail.com accounts live on a different host
    // with no way to detect which a reader holds, which is why both are
    // offered rather than one being guessed at.
    case "outlook-personal":
      return addFromWeb("https://outlook.live.com", feed);

    default:
      return null;
  }
}

/** Microsoft's "Subscribe from web" deep link, same shape on both hosts. */
function addFromWeb(host: string, feed: string): string {
  const url = encodeURIComponent(feed);
  const name = encodeURIComponent(CALENDAR_NAME);
  return `${host}/calendar/0/addfromweb?url=${url}&name=${name}`;
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const app = new URL(req.url).searchParams.get("app") ?? "apple";

  const settings = await loadCalendarSettings();
  if (!settings.connected || !settings.personalFeeds) return notFound();

  // Same cheap shape check the feed does. No database read: this hands the
  // token to a calendar app, and the feed itself is what decides whether the
  // token is real — answering differently here would leak which ones exist.
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return notFound();

  const target = targetFor(app, feedUrl(token));
  if (!target) return notFound();

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": "no-store",
      // The path contains the feed token, so it must not travel to Google or
      // Microsoft in a Referer header on the way through.
      "Referrer-Policy": "no-referrer",
    },
  });
}

/** One answer for every failure, matching the feed route next door. */
function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
