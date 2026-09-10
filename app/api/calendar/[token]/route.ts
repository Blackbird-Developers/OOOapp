import { loadFeedByToken } from "@/lib/calendar";
import { loadCalendarSettings, organizerIdentity } from "@/lib/calendar-settings";
import { buildFeed } from "@/lib/ics";

/**
 * A personal, subscribable out-of-office calendar.
 *
 * Google Calendar, Apple Calendar and Outlook can all subscribe to a URL and
 * re-poll it forever, which makes this the self-healing half of the
 * integration: an invitation email that was deleted, missed or never accepted
 * is corrected the next time the client fetches this document.
 *
 * The document is a mirror, not a list of bookings. It carries cancelled and
 * moved leave as explicit withdrawals alongside the live entries, because a
 * subscribed Outlook calendar never removes an event that merely stops being
 * published — see `loadFeedByToken`. Subscribing once is therefore enough,
 * permanently, on every client.
 *
 * Unauthenticated by necessity — a calendar client has no session and cannot
 * be asked to log in — so the token in the path IS the credential. It is 32
 * bytes of CSPRNG output on a unique column, it is the only thing checked, and
 * every failure answers an identical 404 so the endpoint cannot be used to
 * probe for valid tokens.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const settings = await loadCalendarSettings();
  if (!settings.connected || !settings.personalFeeds) return notFound();

  // Cheap shape check before touching the database. Tokens are base64url of
  // 32 bytes, so anything shorter or carrying other characters is noise.
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return notFound();

  const feed = await loadFeedByToken(token);
  if (!feed) return notFound();

  const ics = buildFeed(feed.entries, {
    organizer: organizerIdentity(),
    calendarName: `${feed.person.full_name} — Out of office`,
    // A personal feed goes into the owner's own calendar, where every entry is
    // theirs and repeating the name in each event title would be noise.
    includeNames: false,
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="blackbird-leave.ics"',
      // Never let Vercel's edge or any proxy hold a copy: the URL is a bearer
      // credential and the body is one person's leave.
      "Cache-Control": "no-store, private",
    },
  });
}

/**
 * One answer for every failure — bad token, unknown token, feature switched
 * off. Distinguishing them would confirm which tokens exist.
 */
function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
