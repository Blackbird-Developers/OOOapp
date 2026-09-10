import { addDays, format, parseISO } from "date-fns";
import type { HalfKind } from "@/lib/days";

/**
 * iCalendar (RFC 5545) generation.
 *
 * This is the whole calendar integration in one file, and it is deliberately
 * hand-rolled rather than pulled from a library: the format is small, the
 * parts that matter are the ones libraries get wrong for our case (all-day
 * DTEND is exclusive, SEQUENCE has to be monotonic for updates to land), and
 * a dependency that emits one wrong line is harder to debug than sixty lines
 * of explicit string building.
 *
 * Why iCalendar at all, rather than the Google and Microsoft REST APIs:
 * Apple publishes no server-side write API for iCloud Calendar, so a
 * push-based design could never have covered iPhone and Mac users. iCalendar
 * is the one language Google Calendar, Outlook, Teams and Apple Calendar all
 * speak natively, and it needs no OAuth app, no cloud project, and no
 * per-user refresh token that can silently expire.
 *
 * Pure functions only — no database, no environment beyond the site URL used
 * to build stable UIDs. Everything here is safe to unit test and safe to call
 * from anywhere on the server.
 */

/** One person's approved leave, in the shape the calendar cares about. */
export type LeaveEvent = {
  /** The leave_requests row id. Anchors the UID, so it must be stable. */
  id: string;
  personName: string;
  personEmail: string;
  /** Inclusive yyyy-MM-dd. */
  startDate: string;
  /** Inclusive yyyy-MM-dd — converted to an exclusive DTEND on the way out. */
  endDate: string;
  halfStart: HalfKind;
  halfEnd: HalfKind;
  days: number;
  /**
   * iCalendar SEQUENCE. A calendar replaces an existing event only when the
   * incoming copy has the same UID and a strictly higher sequence, so this
   * comes from the database rather than being recomputed.
   */
  sequence: number;
  /**
   * Which incarnation of this request the calendar is holding, from
   * `leave_requests.ics_generation`. Part of the UID — see {@link eventUID}.
   * Absent means 0, which is the historical UID spelling.
   */
  generation?: number;
  /** When the request was first made. Emitted as CREATED. */
  createdAt?: string | null;
  /**
   * When the request last changed, emitted as LAST-MODIFIED.
   *
   * How a subscribed calendar tells that an event it already holds has moved.
   * Outlook in particular re-reads the whole feed and needs a per-event reason
   * to replace what it has; with no LAST-MODIFIED and a SEQUENCE that never
   * changes on the feed path, an edited booking can sit there at its old dates
   * indefinitely. Apple and Google are more willing to diff the document
   * itself, which is why this went unnoticed on those two.
   */
  lastModified?: string | null;
};

export type OrganizerIdentity = {
  /** Display name on the ORGANIZER line, e.g. "Blackbird Leave". */
  name: string;
  /** Address on the ORGANIZER line. Never receives replies; RSVP is off. */
  email: string;
};

/**
 * One line in a published feed: either a live booking, or the withdrawal of
 * one that used to be there.
 *
 * The withdrawal half exists because a subscribed calendar cannot be trusted
 * to notice an absence. Google and Apple re-read the whole document and drop
 * whatever is no longer in it; Outlook merges instead — it adds and updates,
 * and an event that simply stops appearing stays in the calendar forever,
 * still blocking the person's availability for a day off that was cancelled
 * weeks ago. The only thing that removes it is being told, in the feed, that
 * the event it is holding is cancelled.
 */
export type FeedEntry = LeaveEvent & {
  /** Publish as a STATUS:CANCELLED tombstone rather than a live event. */
  cancelled?: boolean;
};

const PRODID = "-//Blackbird Marketing//Blackbird Leave//EN";

/**
 * The domain half of every UID. Derived from the deployment URL so two
 * environments (preview and production) cannot mint colliding UIDs for the
 * same request and fight over one event in somebody's calendar.
 */
function uidDomain(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) return "blackbird-leave.local";
  try {
    return new URL(site).hostname || "blackbird-leave.local";
  } catch {
    return "blackbird-leave.local";
  }
}

/**
 * Stable, collision-free identity for one leave request's event.
 *
 * Stable *within one incarnation*, which is the part that matters and the part
 * that used to be wrong. A UID that has been cancelled is tombstoned by
 * calendar clients: Google and Outlook both drop a later REQUEST carrying a
 * UID they have already seen a CANCEL for, rather than re-creating the entry.
 * So an edited-then-re-approved booking, which is withdrawn and then re-sent,
 * needs a UID of its own or it silently never comes back.
 *
 * `generation` supplies that. It moves forward only when an entry is
 * withdrawn, so an ordinary update — same event, higher SEQUENCE — still
 * lands in place, and only a genuine re-creation gets a new identity.
 *
 * Generation 0 keeps the original spelling with no suffix, because entries
 * already filed in people's calendars went out under exactly that UID and
 * would become unreachable by any future cancellation if it changed.
 */
export function eventUID(leaveId: string, generation = 0): string {
  const local = generation > 0 ? `leave-${leaveId}-r${generation}` : `leave-${leaveId}`;
  return `${local}@${uidDomain()}`;
}

/**
 * What the event is called, everywhere.
 *
 * The leave TYPE is deliberately absent, exactly as it is in the Slack
 * digest. A work calendar is rarely as private as it looks — inside a Google
 * Workspace or a Microsoft 365 tenant, colleagues routinely see event titles,
 * not just busy blocks — so writing "Sick leave" into it would broadcast
 * health data to everyone who can open that calendar. "Out of office" is the
 * true and sufficient statement.
 */
function summaryFor(e: LeaveEvent, opts: { includeName: boolean }): string {
  const base = "Out of office";
  const named = opts.includeName ? `${e.personName} — ${base}` : base;
  const half = halfDayNote(e);
  return half ? `${named} (${half})` : named;
}

/**
 * All-day events cannot express a half day, so when one end of the range is a
 * half day the fact is carried in words instead. Over-blocking half a morning
 * is a smaller error than silently hiding it.
 */
function halfDayNote(e: LeaveEvent): string | null {
  const startHalf = e.halfStart !== "full";
  const endHalf = e.halfEnd !== "full";
  if (!startHalf && !endHalf) return null;

  if (e.startDate === e.endDate) return "half day";
  if (startHalf && endHalf) return "half day at each end";
  if (startHalf) return `${e.halfStart === "am" ? "morning" : "afternoon"} only on the first day`;
  return `${e.halfEnd === "am" ? "morning" : "afternoon"} only on the last day`;
}

function descriptionFor(e: LeaveEvent): string {
  const dayWord = e.days === 1 ? "day" : "days";
  const lines = [
    `${e.personName} is out of office.`,
    `${e.days} ${dayWord} of leave, booked in Blackbird Leave.`,
  ];
  const half = halfDayNote(e);
  if (half) lines.push(`Note: ${half}.`);
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) lines.push(`Manage this leave: ${site}/dashboard/my-requests`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Low-level encoding
// ---------------------------------------------------------------------------

/** Escape a TEXT value per RFC 5545 §3.3.11. Order matters: backslash first. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Escape a *parameter* value (the CN= in ORGANIZER;CN=...). Different rules
 * from TEXT: parameters cannot be backslash-escaped, so a value containing
 * a colon, semicolon or comma has to be double-quoted instead, and any double
 * quote in the value has to go entirely — there is no way to encode one.
 */
function escapeParam(value: string): string {
  const cleaned = value.replace(/"/g, "");
  return /[:;,]/.test(cleaned) ? `"${cleaned}"` : cleaned;
}

/**
 * Fold a content line to 75 octets, per RFC 5545 §3.1.
 *
 * Counted in UTF-8 bytes rather than characters, and never split inside a
 * multi-byte sequence — Albanian names carry ë and ç, and cutting one in half
 * produces a file some parsers reject and others render as mojibake.
 */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let offset = 0;
  // First line takes 75 octets; continuations are prefixed with a space, which
  // itself costs one of the 75, leaving 74.
  let budget = 75;

  while (offset < bytes.length) {
    let take = Math.min(budget, bytes.length - offset);
    // Walk back off a continuation byte (10xxxxxx) so the cut lands on a
    // character boundary.
    while (take > 0 && offset + take < bytes.length && (bytes[offset + take] & 0xc0) === 0x80) {
      take--;
    }
    if (take <= 0) take = Math.min(budget, bytes.length - offset); // pathological; emit anyway
    parts.push(bytes.subarray(offset, offset + take).toString("utf8"));
    offset += take;
    budget = 74;
  }

  return parts.join("\r\n ");
}

/** Assemble lines into a CRLF-terminated document with folding applied. */
function assemble(lines: string[]): string {
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** yyyy-MM-dd → yyyyMMdd, the DATE form used by all-day events. */
function toICSDate(iso: string): string {
  return iso.replace(/-/g, "");
}

/**
 * DTEND for an all-day event is EXCLUSIVE (RFC 5545 §3.6.1) — the first day
 * the person is back. Getting this wrong is the classic iCalendar bug: it
 * renders every booking one day short, which nobody notices until someone
 * misses their last day off.
 */
function exclusiveEnd(endISO: string): string {
  return toICSDate(format(addDays(parseISO(endISO), 1), "yyyy-MM-dd"));
}

/** UTC timestamp in the basic format DTSTAMP requires. */
function icsTimestamp(d: Date = new Date()): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * The same, from a database timestamp that may be null or unparseable.
 *
 * Returns null rather than throwing or emitting `Invalid Date`: these two
 * properties are an optimisation for clients that use them, and one bad row
 * must not take the whole feed down with it.
 */
function icsTimestampFrom(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : icsTimestamp(d);
}

// ---------------------------------------------------------------------------
// VEVENT
// ---------------------------------------------------------------------------

type EventOptions = {
  organizer: OrganizerIdentity;
  /** Prefix the title with the person's name — true for shared feeds. */
  includeName: boolean;
  /** CANCELLED tombstones the event; CONFIRMED is a live booking. */
  status: "CONFIRMED" | "CANCELLED";
  /** Address the ATTENDEE line, so the event lands in the right calendar. */
  withAttendee: boolean;
  stamp?: Date;
};

/** CREATED and LAST-MODIFIED, for whichever of the two the row can supply. */
function timestampLines(e: LeaveEvent): string[] {
  const lines: string[] = [];
  const created = icsTimestampFrom(e.createdAt);
  if (created) lines.push(`CREATED:${created}`);
  const modified = icsTimestampFrom(e.lastModified);
  if (modified) lines.push(`LAST-MODIFIED:${modified}`);
  return lines;
}

function vevent(e: LeaveEvent, opts: EventOptions): string[] {
  const cancelled = opts.status === "CANCELLED";

  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${eventUID(e.id, e.generation)}`,
    `DTSTAMP:${icsTimestamp(opts.stamp)}`,
    `DTSTART;VALUE=DATE:${toICSDate(e.startDate)}`,
    `DTEND;VALUE=DATE:${exclusiveEnd(e.endDate)}`,
    `SUMMARY:${escapeText(summaryFor(e, { includeName: opts.includeName }))}`,
    `DESCRIPTION:${escapeText(descriptionFor(e))}`,
    `SEQUENCE:${e.sequence}`,
    `STATUS:${opts.status}`,
    // How a subscribed calendar notices an event it already holds has moved.
    // Without it Outlook keeps the copy it fetched the first time.
    ...timestampLines(e),
    // OPAQUE means the time counts as busy. That is the point of the whole
    // feature: a day off should stop a colleague booking a meeting over it.
    //
    // A withdrawn entry flips to TRANSPARENT, which matters more than it
    // looks: if a client is stubborn enough to keep the row on screen after
    // being told it is cancelled, this at least stops it going on blocking
    // the person's availability for a day off that no longer exists.
    `TRANSP:${cancelled ? "TRANSPARENT" : "OPAQUE"}`,
    `ORGANIZER;CN=${escapeParam(opts.organizer.name)}:mailto:${opts.organizer.email}`,
  ];

  if (opts.withAttendee) {
    // PARTSTAT=ACCEPTED and RSVP=FALSE on purpose. This is not a meeting the
    // employee may decline — the leave is already approved — so the event is
    // delivered pre-accepted and no reply is solicited. Without ACCEPTED,
    // Outlook shows an unanswered invite sitting in the calendar in italics.
    lines.push(
      `ATTENDEE;CN=${escapeParam(e.personName)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${e.personEmail}`
    );
  }

  lines.push(
    // Microsoft reads these two rather than TRANSP. OOF is what turns the
    // person's Teams presence and Outlook availability to "Out of Office"
    // instead of a plain "Busy" — the difference the team actually sees, and
    // FREE is what gives it back the moment the leave is withdrawn.
    `X-MICROSOFT-CDO-BUSYSTATUS:${cancelled ? "FREE" : "OOF"}`,
    "X-MICROSOFT-CDO-ALLDAYEVENT:TRUE",
    "END:VEVENT"
  );

  return lines;
}

function calendar(method: string, body: string[], extraHeaders: string[] = []): string {
  return assemble([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    `METHOD:${method}`,
    "CALSCALE:GREGORIAN",
    ...extraHeaders,
    ...body,
    "END:VCALENDAR",
  ]);
}

// ---------------------------------------------------------------------------
// Public builders
// ---------------------------------------------------------------------------

/**
 * A calendar invitation for approved leave.
 *
 * METHOD:REQUEST is what makes Gmail, Outlook and Apple Mail treat the
 * attachment as an invitation to file rather than a document to download.
 * Re-sending the same UID with a higher SEQUENCE updates the event in place,
 * which is how an edited booking moves instead of duplicating.
 */
export function buildInvite(e: LeaveEvent, organizer: OrganizerIdentity): string {
  return calendar("REQUEST", vevent(e, {
    organizer,
    includeName: false,
    status: "CONFIRMED",
    withAttendee: true,
  }));
}

/**
 * The withdrawal of a previously sent invitation.
 *
 * METHOD:CANCEL plus STATUS:CANCELLED is the only way to remove an event a
 * calendar has already filed. It must carry the same UID and a HIGHER
 * sequence than the invite it revokes, or clients ignore it as stale.
 */
export function buildCancellation(e: LeaveEvent, organizer: OrganizerIdentity): string {
  return calendar("CANCEL", vevent(e, {
    organizer,
    includeName: false,
    status: "CANCELLED",
    withAttendee: true,
  }));
}

/**
 * A subscribable calendar: every event in one document, refetched by the
 * client on its own schedule.
 *
 * METHOD:PUBLISH and no ATTENDEE, because a feed is read-only broadcast
 * rather than an invitation addressed to anyone. `X-WR-CALNAME` is
 * non-standard but universally honoured, and without it Google and Apple both
 * name the subscription after its URL, which is unreadable.
 */
export function buildFeed(
  entries: FeedEntry[],
  opts: { organizer: OrganizerIdentity; calendarName: string; includeNames: boolean }
): string {
  const body = entries.flatMap((e) =>
    vevent(e, {
      organizer: opts.organizer,
      includeName: opts.includeNames,
      // A cancelled entry is still published, not omitted. See {@link FeedEntry}.
      status: e.cancelled ? "CANCELLED" : "CONFIRMED",
      withAttendee: false,
    })
  );

  return calendar("PUBLISH", body, [
    `X-WR-CALNAME:${escapeText(opts.calendarName)}`,
    `NAME:${escapeText(opts.calendarName)}`,
    // How often a client should re-poll. Advisory: Google honours it loosely
    // and Apple honours it closely, which is why the invite email exists as
    // the immediate path and the feed is the self-healing one.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ]);
}
