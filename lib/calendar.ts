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
  /** Undefined when migration 011 has not been run — treated as 0 throughout. */
  ics_generation?: number;
};

const BASE_LEAVE_COLUMNS =
  "id, user_id, start_date, end_date, half_start, half_end, days_count, status, ics_sequence";

/**
 * Whether `leave_requests.ics_generation` exists yet.
 *
 * Null until the first query answers the question. Migration 011 is run by
 * hand in the Supabase SQL editor, exactly as 010 was, so the code has to work
 * either side of it: deploying first and migrating later must not silently
 * stop every calendar entry, which is what an unguarded select on a missing
 * column would do.
 */
let hasGenerationColumn: boolean | null = null;

function leaveColumns(): string {
  return hasGenerationColumn === false
    ? BASE_LEAVE_COLUMNS
    : `${BASE_LEAVE_COLUMNS}, ics_generation`;
}

/** Postgres `undefined_column`. The one error we retry rather than report. */
function isMissingColumn(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || /ics_generation/.test(error.message ?? "");
}

/** A request's generation, with the pre-migration default. */
function generationOf(leave: LeaveRow): number {
  return leave.ics_generation ?? 0;
}

type QueryError = { code?: string; message?: string } | null;

/**
 * Run a `leave_requests` select, retrying once without `ics_generation` if the
 * column turns out not to exist yet.
 *
 * The answer is remembered, so the retry happens at most once per process
 * rather than on every read. Both readers below go through here for the same
 * reason: either could be the first query after a deploy.
 *
 * The row type is asserted rather than inferred: the column list is chosen at
 * runtime, so the client cannot know the shape, exactly as it could not when
 * the list was a constant.
 */
async function readLeave<T>(
  run: (columns: string) => PromiseLike<{ data: unknown; error: QueryError }>
): Promise<{ data: T | null; error: QueryError }> {
  let result = await run(leaveColumns());

  if (result.error && hasGenerationColumn === null && isMissingColumn(result.error)) {
    hasGenerationColumn = false;
    result = await run(leaveColumns());
  } else if (!result.error && hasGenerationColumn === null) {
    hasGenerationColumn = true;
  }

  return { data: (result.data as T | null) ?? null, error: result.error };
}

/**
 * Move a request's SEQUENCE forward, and its generation too when the event is
 * being withdrawn. Returns the sequence to send at, or null to abort.
 *
 * Every outgoing copy of an event — invitation, update, cancellation — must
 * carry a strictly higher sequence than the last one, or calendar clients
 * treat it as a stale duplicate and ignore it. Because it is persisted, a
 * sequence survives redeploys and cannot go backwards.
 *
 * A side effect of that rule doubles as useful state: a sequence of 0 means
 * nothing has ever been sent for this request, so there is no event out there
 * to cancel.
 *
 * The generation moves only on withdrawal, and only the *stored* value moves —
 * the cancellation being built still has to address the event the calendar is
 * holding, so it goes out under the current generation. The next invitation
 * then picks up the new one and describes a new event rather than trying to
 * revive a UID the client has tombstoned.
 */
async function advanceEvent(
  leave: LeaveRow,
  opts: { withdrawing: boolean }
): Promise<number | null> {
  const next = leave.ics_sequence + 1;
  const patch: Record<string, number> = { ics_sequence: next };

  // Only written when the column is known to exist. Including it otherwise
  // would fail the whole update and take the sequence bump down with it.
  if (opts.withdrawing && hasGenerationColumn) {
    patch.ics_generation = generationOf(leave) + 1;
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("leave_requests").update(patch).eq("id", leave.id);
  if (error) {
    console.error("[calendar] could not advance the event:", error.message);
    // Returning the un-bumped value would re-send at a sequence the client has
    // already seen, which silently does nothing. Better to abort the send.
    return null;
  }
  return next;
}

async function loadLeave(leaveId: string): Promise<{
  leave: LeaveRow;
  person: { full_name: string; email: string };
} | null> {
  const supabase = createAdminClient();

  const { data: leave, error } = await readLeave<LeaveRow>((columns) =>
    supabase.from("leave_requests").select(columns).eq("id", leaveId).maybeSingle()
  );

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
    // Always the generation the calendar is currently holding — including on a
    // cancellation, which has to address the event that exists rather than the
    // one the next approval will create.
    generation: generationOf(leave),
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

    const sequence = await advanceEvent(loaded.leave, { withdrawing: false });
    if (sequence === null) return null;

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
 * Returns null when the integration is disconnected, or when nothing was ever
 * sent for this request (sequence 0) — a CANCEL for a UID the client has never
 * seen is harmless but confusing, and it would put a stray attachment on the
 * rejection email for every pending request an admin turns down.
 *
 * Deliberately *not* gated on `sendInvites`, unlike the invitation path. That
 * switch governs whether new entries are created; a cancellation is cleanup
 * for one that already exists, proven by the non-zero sequence. Skipping it
 * because the switch has since been turned off would strand a day off in
 * somebody's calendar for leave that has been cancelled or moved — blocking
 * their availability for dates nobody has agreed to, with nothing in the app
 * to explain it.
 *
 * Disconnecting the integration entirely is the one case that does stop this,
 * because the disconnect dialog explicitly promises entries already filed are
 * left alone.
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
  if (!settings.connected) return null;

  const loaded = await loadLeave(leaveId);
  if (!loaded) return null;
  if (loaded.leave.ics_sequence === 0) return null;

  const sequence = await advanceEvent(loaded.leave, { withdrawing: true });
  if (sequence === null) return null;

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

  const { data: rows } = await readLeave<LeaveRow[]>((columns) =>
    supabase
      .from("leave_requests")
      .select(columns)
      .eq("user_id", person.id)
      .eq("status", "approved")
      .gte("end_date", from)
      .order("start_date", { ascending: true })
  );

  const events = (rows ?? []).map((r) =>
    toEvent(r, { full_name: person.full_name, email: person.email }, r.ics_sequence)
  );

  return { person: { full_name: person.full_name }, events };
}
