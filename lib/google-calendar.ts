import { addDays, format, parseISO } from "date-fns";
import {
  CALENDAR_EVENTS_SCOPE,
  forgetToken,
  getAccessTokenFor,
  type GoogleCredentials,
} from "@/lib/google-auth";
import { APP_TIME_ZONE, zonedInstant, type HalfKind } from "@/lib/days";

/**
 * Approved leave as a real Google Calendar "Out of office" event.
 *
 * Why this exists alongside the iCalendar invite in lib/ics.ts: an emailed
 * invite can only ever become an ordinary busy event, and to everything that
 * reads the calendar an ordinary busy event is a meeting. Slack's Google
 * Calendar app is the case that forced it — it flipped people's status to
 * "In a meeting" for the whole of their holiday. The Out of office event type
 * is the one thing that app reads as "away", and it can only be created
 * through the Calendar API, so for mailboxes the service account can reach
 * (Blackbird's Workspace) this replaces the invite. Everyone else keeps the
 * invite.
 *
 * The event id is derived from the leave request id, so nothing new has to be
 * stored to find the event again: approving writes to that id, withdrawing
 * deletes it, and re-approving an edited request writes to it once more —
 * Google brings a deleted event back when it is updated, where inserting the
 * same id again would be refused as a duplicate.
 *
 * Server-only.
 */

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export type OutOfOfficeLeave = {
  /** The leave_requests row id. Anchors the event id, so it must be stable. */
  id: string;
  personName: string;
  /** Inclusive yyyy-MM-dd. */
  startDate: string;
  /** Inclusive yyyy-MM-dd. */
  endDate: string;
  halfStart: HalfKind;
  halfEnd: HalfKind;
  days: number;
};

export class GoogleCalendarError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GoogleCalendarError";
    this.status = status;
  }
}

/**
 * The Google event id for one leave request.
 *
 * Google accepts client-chosen ids made of base32hex characters (0-9, a-v),
 * 5 to 1024 long. A UUID with its hyphens removed is lowercase hex, which is a
 * subset of that, and the prefix is spelt only from a-v as well.
 */
export function outOfOfficeEventId(leaveId: string): string {
  return `bbleave${leaveId.toLowerCase().replace(/[^0-9a-v]/g, "")}`;
}

/**
 * When the event starts and ends, in Kosovo time.
 *
 * Google refuses an all-day Out of office event, so the range is timed:
 * midnight to midnight, with half days honoured at either end the same way the
 * auto-reply honours them. A single half day is the morning or the afternoon
 * of that one date, whichever flag says so.
 */
export function outOfOfficeWindow(leave: OutOfOfficeLeave): { start: Date; end: Date } {
  const dayAfter = (iso: string) => format(addDays(parseISO(iso), 1), "yyyy-MM-dd");

  if (leave.startDate === leave.endDate && (leave.halfStart !== "full" || leave.halfEnd !== "full")) {
    const morning = leave.halfStart === "am" || leave.halfEnd === "am";
    return morning
      ? { start: zonedInstant(leave.startDate, 0), end: zonedInstant(leave.startDate, 12) }
      : { start: zonedInstant(leave.startDate, 12), end: zonedInstant(dayAfter(leave.startDate), 0) };
  }

  return {
    start: zonedInstant(leave.startDate, leave.halfStart === "pm" ? 12 : 0),
    end: leave.halfEnd === "am"
      ? zonedInstant(leave.endDate, 12)
      : zonedInstant(dayAfter(leave.endDate), 0),
  };
}

function eventBody(leave: OutOfOfficeLeave) {
  const { start, end } = outOfOfficeWindow(leave);

  // Kept to the fields Google's own Out of office events carry. Google refuses
  // this event type with a description ("An out of office event must not have
  // a description"), so the details the emailed invite gives in its body have
  // no place here; extra fields like extendedProperties are left off for the
  // same reason, since nothing reads them — the event is found again by id.
  return {
    id: outOfOfficeEventId(leave.id),
    // No leave type, for the reason lib/ics.ts gives: colleagues can see
    // titles, and "Sick leave" in a shared calendar is health data.
    summary: "Out of office",
    eventType: "outOfOffice",
    // Required by Google for this event type, and the point anyway: the time
    // is unavailable.
    transparency: "opaque",
    status: "confirmed",
    start: { dateTime: start.toISOString(), timeZone: APP_TIME_ZONE },
    end: { dateTime: end.toISOString(), timeZone: APP_TIME_ZONE },
    outOfOfficeProperties: {
      // Meetings already in the calendar are left for the person to sort out;
      // only new invitations landing on the leave are turned down.
      autoDeclineMode: "declineOnlyNewConflictingInvitations",
      declineMessage: `${leave.personName} is on leave and will reply when back.`,
    },
  };
}

/**
 * Put the Out of office event for `leave` in `mailbox`'s primary calendar,
 * creating it, moving it, or bringing back one that was withdrawn.
 */
export async function putOutOfOffice(
  mailbox: string,
  credentials: GoogleCredentials,
  leave: OutOfOfficeLeave
): Promise<void> {
  const body = JSON.stringify(eventBody(leave));
  const id = outOfOfficeEventId(leave.id);

  // Update first: it covers both an event that is live and one that was
  // deleted earlier, which Google keeps under its id and refuses to insert
  // again. Only an id Google has never seen falls through to the insert.
  const updated = await call(mailbox, credentials, `${EVENTS_URL}/${id}?sendUpdates=none`, {
    method: "PUT",
    body,
  });
  if (updated.ok) return;
  if (updated.status !== 404 && updated.status !== 410) {
    throw await failure(updated, mailbox);
  }

  const inserted = await call(mailbox, credentials, `${EVENTS_URL}?sendUpdates=none`, {
    method: "POST",
    body,
  });
  if (!inserted.ok) throw await failure(inserted, mailbox);
}

/**
 * Take the Out of office event for a leave request back out.
 *
 * Returns whether there was a live event to remove. False means this request
 * was never placed through the API — leave approved before this existed, or
 * whose placement failed and fell back to an emailed invite — and so the
 * caller still owes the person an iCalendar cancellation.
 */
export async function deleteOutOfOffice(
  mailbox: string,
  credentials: GoogleCredentials,
  leaveId: string
): Promise<boolean> {
  const id = outOfOfficeEventId(leaveId);
  const res = await call(mailbox, credentials, `${EVENTS_URL}/${id}?sendUpdates=none`, {
    method: "DELETE",
  });
  if (res.ok) return true;
  // 410 is an id that existed but is already deleted: nothing live either.
  if (res.status === 404 || res.status === 410) return false;
  throw await failure(res, mailbox);
}

async function call(
  mailbox: string,
  credentials: GoogleCredentials,
  url: string,
  init: RequestInit
): Promise<Response> {
  const token = await getAccessTokenFor(mailbox, credentials, CALENDAR_EVENTS_SCOPE);

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        authorization: `Bearer ${token}`,
      },
    });
  } catch (e) {
    throw new GoogleCalendarError(
      `Could not reach Google Calendar: ${e instanceof Error ? e.message : "network error"}`,
      0
    );
  }

  // Same reasoning as lib/gmail.ts: a token Google has stopped honouring would
  // otherwise keep being handed out of the cache until our clock expired it.
  if (res.status === 401) forgetToken(mailbox, CALENDAR_EVENTS_SCOPE);
  return res;
}

/**
 * Google Calendar errors, translated into the sentence that names the fix.
 *
 * 403 is the one that matters, as it is for Gmail: either the Calendar API is
 * switched off on the Cloud project, or the delegation lacks the scope.
 */
async function failure(res: Response, mailbox: string): Promise<GoogleCalendarError> {
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  const detail = body.error?.message ?? `HTTP ${res.status}`;

  const message =
    res.status === 403
      ? /disabled|not been used|enable/i.test(detail)
        ? `Google Calendar refused the call (${detail}). The Google Calendar API is most likely not enabled on the Google Cloud project — open APIs & Services → Library → Google Calendar API → Enable.`
        : `Google Calendar refused the call for ${mailbox} (${detail}). Check the domain-wide delegation lists the scope ${CALENDAR_EVENTS_SCOPE}.`
      : `Google Calendar returned ${res.status} for ${mailbox} (${detail}).`;

  return new GoogleCalendarError(message, res.status);
}
