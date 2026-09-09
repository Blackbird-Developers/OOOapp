import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildInvite, buildCancellation, type LeaveEvent } from "@/lib/ics";
import { loadCalendarSettings, organizerIdentity } from "@/lib/calendar-settings";
import { emailCalendarWithdrawn, type CalendarAttachment } from "@/lib/email";
import type { HalfKind } from "@/lib/days";

/**
 * The calendar integration's moving parts: when an event is sent, when it is
 * taken back, and how a person's subscription feed is addressed.
 *
 * Everything here is best-effort by construction. The leave decision is
 * already committed by the time these run, so a calendar failure is logged and
 * swallowed — never allowed to turn a successful approval into a 500. The
 * subscription feed is the backstop that heals whatever a failed send missed.
 *
 * Server-only: service-role client throughout.
 */

type LeaveRow = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  half_start: HalfKind;
  half_end: HalfKind;
  days_count: number;
  status: string;
  ics_sequence: number;
};

const LEAVE_COLUMNS =
  "id, user_id, start_date, end_date, half_start, half_end, days_count, status, ics_sequence";

/**
 * Move a request's SEQUENCE forward and return the new value.
 *
 * Every outgoing copy of an event — invitation, update, cancellation — must
 * carry a strictly higher sequence than the last one, or calendar clients
 * treat it as a stale duplicate and ignore it. Because it is persisted, a
 * sequence survives redeploys and cannot go backwards.
 *
 * A side effect of that rule doubles as useful state: a sequence of 0 means
 * nothing has ever been sent for this request, so there is no event out there
 * to cancel.
 */
async function bumpSequence(leaveId: string, current: number): Promise<number> {
  const next = current + 1;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({ ics_sequence: next })
    .eq("id", leaveId);
  if (error) {
    console.error("[calendar] could not bump ics_sequence:", error.message);
    // Returning the un-bumped value would re-send at a sequence the client has
    // already seen, which silently does nothing. Better to abort the send.
    return -1;
  }
  return next;
}

async function loadLeave(leaveId: string): Promise<{
  leave: LeaveRow;
  person: { full_name: string; email: string };
} | null> {
  const supabase = createAdminClient();
  const { data: leave, error } = await supabase
    .from("leave_requests")
    .select(LEAVE_COLUMNS)
    .eq("id", leaveId)
    .maybeSingle();

  if (error || !leave) {
    if (error) console.error("[calendar] could not read leave request:", error.message);
    return null;
  }

  const { data: person } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", (leave as LeaveRow).user_id)
    .single();

  if (!person) return null;
  return { leave: leave as LeaveRow, person };
}

function toEvent(leave: LeaveRow, person: { full_name: string; email: string }, sequence: number): LeaveEvent {
  return {
    id: leave.id,
    personName: person.full_name,
    personEmail: person.email,
    startDate: leave.start_date,
    endDate: leave.end_date,
    halfStart: leave.half_start,
    halfEnd: leave.half_end,
    days: Number(leave.days_count),
    sequence,
  };
}

/**
 * Build the invitation for approved leave and hand it back for the approval
 * email to carry.
 *
 * Returns null whenever the integration is switched off, invites are disabled,
 * or the sequence bump failed — every one of which means "send the ordinary
 * email without an attachment", not "fail".
 */
export async function buildApprovalCalendarAttachment(
  leaveId: string
): Promise<CalendarAttachment | null> {
  try {
    const settings = await loadCalendarSettings();
    if (!settings.connected || !settings.sendInvites) return null;

    const loaded = await loadLeave(leaveId);
    if (!loaded) return null;

    const sequence = await bumpSequence(leaveId, loaded.leave.ics_sequence);
    if (sequence < 0) return null;

    const event = toEvent(loaded.leave, loaded.person, sequence);
    return {
      ics: buildInvite(event, organizerIdentity()),
      method: "REQUEST",
      // Lets the email offer one-click subscribe buttons, but only when that
      // half of the integration is switched on — otherwise it would advertise
      // a feed the route would answer 404 for.
      subscribeUrl: settings.personalFeeds
        ? await feedUrlForUser(loaded.leave.user_id)
        : undefined,
    };
  } catch (e) {
    console.warn("[calendar] could not build approval invite:", e);
    return null;
  }
}

/**
 * The dates an event was actually filed under.
 *
 * Needed because a cancellation is sometimes built *after* the row has already
 * moved on — an employee editing approved leave rewrites the dates before the
 * old entry has been withdrawn. Reading the row at that point would describe
 * the booking nobody has agreed to yet rather than the one sitting in their
 * calendar.
 */
export type Occurrence = { startDate: string; endDate: string };

/**
 * Everything a withdrawal needs, or null when there is nothing to withdraw.
 *
 * Returns null when the integration is off, when invitations are disabled, or
 * when nothing was ever sent for this request (sequence 0) — a CANCEL for a
 * UID the client has never seen is harmless but confusing, and it would put a
 * stray attachment on the rejection email for every pending request an admin
 * turns down.
 */
async function prepareCancellation(
  leaveId: string,
  occurrence?: Occurrence
): Promise<{
  calendar: CalendarAttachment & { method: "CANCEL" };
  person: { full_name: string; email: string };
  leave: LeaveRow;
} | null> {
  const settings = await loadCalendarSettings();
  if (!settings.connected || !settings.sendInvites) return null;

  const loaded = await loadLeave(leaveId);
  if (!loaded) return null;
  if (loaded.leave.ics_sequence === 0) return null;

  const sequence = await bumpSequence(leaveId, loaded.leave.ics_sequence);
  if (sequence < 0) return null;

  const event = toEvent(loaded.leave, loaded.person, sequence);
  // Clients match a cancellation on UID, so this is not what makes the event
  // disappear — but a CANCEL should still mirror the event it revokes, and the
  // same dates go into the email the employee reads.
  if (occurrence) {
    event.startDate = occurrence.startDate;
    event.endDate = occurrence.endDate;
  }

  return {
    // No subscribe offer on a withdrawal: the email is telling somebody their
    // day off has gone, which is the wrong moment to sell them a feature.
    calendar: { ics: buildCancellation(event, organizerIdentity()), method: "CANCEL" },
    person: loaded.person,
    leave: loaded.leave,
  };
}

/**
 * The cancellation attachment for an email that is going out anyway — an admin
 * cancelling approved leave, where the employee is already being told.
 */
export async function buildCancellationCalendarAttachment(
  leaveId: string,
  occurrence?: Occurrence
): Promise<CalendarAttachment | null> {
  try {
    const prepared = await prepareCancellation(leaveId, occurrence);
    return prepared?.calendar ?? null;
  } catch (e) {
    console.warn("[calendar] could not build cancellation:", e);
    return null;
  }
}

/**
 * Take an event back out of somebody's calendar when there is no other email
 * going to them — the employee-edits-approved-leave case.
 *
 * Silent when there was no event to withdraw, so an ordinary edit of a pending
 * request sends nothing at all.
 */
export async function withdrawCalendarEvent(
  leaveId: string,
  occurrence: Occurrence
): Promise<void> {
  try {
    const prepared = await prepareCancellation(leaveId, occurrence);
    if (!prepared) return;

    await emailCalendarWithdrawn({
      to: prepared.person.email,
      employeeName: prepared.person.full_name,
      // The dates the entry was filed under, which by now are not the ones on
      // the row — the caller supplies them for exactly that reason.
      startDate: occurrence.startDate,
      endDate: occurrence.endDate,
      calendar: prepared.calendar,
    });
  } catch (e) {
    console.warn("[calendar] withdrawal email failed:", e);
  }
}

// ---------------------------------------------------------------------------
// Subscription feed
// ---------------------------------------------------------------------------

/**
 * The address of a feed, given its token.
 *
 * Lives here rather than in the route that first needed it, because the
 * approval email now builds the same URL and two spellings of it would drift.
 */
export function feedUrl(token: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${site.replace(/\/$/, "")}/api/calendar/${token}`;
}

/**
 * A person's own feed URL, for an email that is about to offer them a
 * one-click subscribe button.
 *
 * Mints a token if they have never had one. That is a deliberate departure
 * from the account page, which waits to be asked: by the time somebody's leave
 * is approved they are plainly an active user, and a button that cannot be
 * built is worse than a token that is never used.
 */
async function feedUrlForUser(userId: string): Promise<string | undefined> {
  const token = await getOrCreateFeedToken(userId);
  return token ? feedUrl(token) : undefined;
}

/**
 * The secret in a feed URL.
 *
 * 32 bytes of CSPRNG output, base64url so it survives being pasted into a URL
 * bar by hand. This is a bearer credential in the truest sense — a calendar
 * client cannot log in, so anyone holding the URL can read the feed — which is
 * why it is this long and why regenerating it is offered prominently.
 */
function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The caller's feed token, creating one the first time they ask for it. */
export async function getOrCreateFeedToken(userId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("calendar_token")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("[calendar] could not read calendar_token:", error.message);
    return null;
  }
  if (data?.calendar_token) return data.calendar_token as string;

  return regenerateFeedToken(userId);
}

/** Mint a fresh token, instantly invalidating whatever URL was handed out. */
export async function regenerateFeedToken(userId: string): Promise<string | null> {
  const token = mintToken();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ calendar_token: token })
    .eq("id", userId);

  if (error) {
    console.error("[calendar] could not write calendar_token:", error.message);
    return null;
  }
  return token;
}

/**
 * Resolve a feed token to the person it belongs to, plus their approved leave.
 *
 * The token is matched with a plain equality filter on a unique column, so a
 * wrong one finds nothing and the route answers 404 — no distinction is drawn
 * between "no such token" and "token for a person with no leave", because
 * telling those apart would let someone probe for valid tokens.
 */
export async function loadFeedByToken(token: string): Promise<{
  person: { full_name: string };
  events: LeaveEvent[];
} | null> {
  const supabase = createAdminClient();

  const { data: person, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("calendar_token", token)
    .maybeSingle();

  if (error || !person) return null;

  // A rolling window rather than everything ever booked. Calendar clients
  // re-download the whole document on every poll, so last year onwards keeps
  // it small while still covering anything a person can still see or edit.
  const from = `${new Date().getFullYear() - 1}-01-01`;

  const { data: rows } = await supabase
    .from("leave_requests")
    .select(LEAVE_COLUMNS)
    .eq("user_id", person.id)
    .eq("status", "approved")
    .gte("end_date", from)
    .order("start_date", { ascending: true });

  const events = ((rows ?? []) as LeaveRow[]).map((r) =>
    toEvent(r, { full_name: person.full_name, email: person.email }, r.ics_sequence)
  );

  return { person: { full_name: person.full_name }, events };
}
