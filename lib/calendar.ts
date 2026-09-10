import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildInvite, buildCancellation, type FeedEntry, type LeaveEvent } from "@/lib/ics";
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
  /**
   * When the calendar copy of this request last changed. Undefined when
   * migration 012 has not been run; null on rows that predate it.
   */
  ics_updated_at?: string | null;
  created_at: string | null;
  decided_at: string | null;
};

const BASE_LEAVE_COLUMNS =
  "id, user_id, start_date, end_date, half_start, half_end, days_count, status, ics_sequence, created_at, decided_at";

/**
 * Columns added by a migration that is run by hand in the Supabase SQL editor,
 * and so may not exist yet on any given deployment.
 *
 * The code has to work either side of each one: deploying first and migrating
 * later must not silently stop every calendar entry, which is what an
 * unguarded select on a missing column would do.
 */
const OPTIONAL_LEAVE_COLUMNS = ["ics_generation", "ics_updated_at"] as const;
type OptionalColumn = (typeof OPTIONAL_LEAVE_COLUMNS)[number];

/**
 * What the database has actually got, learned from the first query that
 * mentions each column and remembered for the life of the process.
 *
 * Three states, and the difference matters. A column missing from this map is
 * *unknown*: worth selecting, because the select is what answers the question,
 * but never worth writing — an update naming a column that does not exist
 * fails whole, taking the sequence bump down with it. Only a column confirmed
 * present is safe to write.
 */
const optionalColumns = new Map<OptionalColumn, boolean>();

/** Whether a column is known to exist. Unknown counts as no. */
function columnPresent(column: OptionalColumn): boolean {
  return optionalColumns.get(column) === true;
}

function selectableColumns(): OptionalColumn[] {
  return OPTIONAL_LEAVE_COLUMNS.filter((c) => optionalColumns.get(c) !== false);
}

function leaveColumns(): string {
  return [BASE_LEAVE_COLUMNS, ...selectableColumns()].join(", ");
}

/** Postgres `undefined_column`, however the layer above chose to word it. */
function isUndefinedColumn(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || /does not exist/i.test(error.message ?? "");
}

/**
 * The optional column a failed select is complaining about, or null when the
 * error does not name one.
 *
 * PostgREST spells it out — `column leave_requests.ics_updated_at does not
 * exist` — which is what lets a single missing column be dropped while the
 * others are kept. A `42703` that names nothing recognisable falls back to
 * dropping all of them; see {@link readLeave}.
 */
function missingColumnFrom(error: { code?: string; message?: string }): OptionalColumn | null {
  if (!isUndefinedColumn(error)) return null;
  const message = error.message ?? "";
  return OPTIONAL_LEAVE_COLUMNS.find((c) => message.includes(c)) ?? null;
}

/** A request's generation, with the pre-migration default. */
function generationOf(leave: LeaveRow): number {
  return leave.ics_generation ?? 0;
}

type QueryError = { code?: string; message?: string } | null;

/**
 * Run a `leave_requests` select, dropping any optional column that turns out
 * not to exist yet and trying again.
 *
 * Each answer is remembered, so a retry happens at most once per column per
 * process rather than on every read. Every reader below goes through here for
 * the same reason: any one of them could be the first query after a deploy.
 *
 * The row type is asserted rather than inferred: the column list is chosen at
 * runtime, so the client cannot know the shape, exactly as it could not when
 * the list was a constant.
 */
async function readLeave<T>(
  run: (columns: string) => PromiseLike<{ data: unknown; error: QueryError }>
): Promise<{ data: T | null; error: QueryError }> {
  // Bounded by construction: every retry marks one more column absent, and
  // there are only ever OPTIONAL_LEAVE_COLUMNS.length of them to lose.
  for (;;) {
    const selected = selectableColumns();
    const result = await run(leaveColumns());

    if (!result.error) {
      // A select that came back is proof of every column it named.
      for (const column of selected) optionalColumns.set(column, true);
      return { data: (result.data as T | null) ?? null, error: null };
    }

    const missing = missingColumnFrom(result.error);
    if (missing && optionalColumns.get(missing) !== false) {
      optionalColumns.set(missing, false);
      continue;
    }

    // An undefined-column error that names none of them. Which one is beyond
    // reach, so fall back to the base list — the same degradation this had
    // when there was only one optional column to lose. `selected` being empty
    // means they have all been dropped already and the error is something
    // else, which terminates the loop.
    if (!missing && isUndefinedColumn(result.error) && selected.length > 0) {
      for (const column of selected) optionalColumns.set(column, false);
      continue;
    }

    return { data: null, error: result.error };
  }
}

/**
 * What one copy of an event is stamped with: the SEQUENCE it goes out at, and
 * the moment it changed.
 */
type Revision = { sequence: number; updatedAt: string };

/**
 * Move a request's SEQUENCE forward, and its generation too when the event is
 * being withdrawn. Returns the revision to send at, or null to abort.
 *
 * Every outgoing copy of an event — invitation, update, cancellation, and
 * every line of the subscription feed — must carry a strictly higher sequence
 * than the last one, or calendar clients treat it as a stale duplicate and
 * ignore it. Because it is persisted, a sequence survives redeploys and cannot
 * go backwards.
 *
 * This runs on every publication and every withdrawal, including when
 * invitation emails are switched off. That is what keeps the guarantee the
 * feed depends on: the cancellation of a booking always out-ranks the booking
 * itself, whichever route each of them travelled.
 *
 * A side effect of that rule doubles as useful state: a sequence of 0 means
 * this request has never been published anywhere — see {@link everPublished}.
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
): Promise<Revision | null> {
  const next = leave.ics_sequence + 1;
  const updatedAt = new Date().toISOString();
  const patch: Record<string, number | string> = { ics_sequence: next };

  // Only written when the column is known to exist. Including it otherwise
  // would fail the whole update and take the sequence bump down with it.
  if (opts.withdrawing && columnPresent("ics_generation")) {
    patch.ics_generation = generationOf(leave) + 1;
  }
  if (columnPresent("ics_updated_at")) {
    patch.ics_updated_at = updatedAt;
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("leave_requests").update(patch).eq("id", leave.id);
  if (error) {
    console.error("[calendar] could not advance the event:", error.message);
    // Returning the un-bumped value would re-send at a sequence the client has
    // already seen, which silently does nothing. Better to abort the send.
    return null;
  }
  return { sequence: next, updatedAt };
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

function toEvent(
  leave: LeaveRow,
  person: { full_name: string; email: string },
  revision: Revision
): LeaveEvent {
  return {
    id: leave.id,
    personName: person.full_name,
    personEmail: person.email,
    startDate: leave.start_date,
    endDate: leave.end_date,
    halfStart: leave.half_start,
    halfEnd: leave.half_end,
    days: Number(leave.days_count),
    sequence: revision.sequence,
    // Always the generation the calendar is currently holding — including on a
    // cancellation, which has to address the event that exists rather than the
    // one the next approval will create.
    generation: generationOf(leave),
    createdAt: leave.created_at,
    // The moment this event last changed, which is what a subscribed calendar
    // reads to decide whether to replace the copy it holds. It has to be the
    // *calendar's* clock rather than decided_at: an admin cancelling approved
    // leave leaves the decision timestamp exactly where it was, so the entry
    // that most needed to look changed was the one that looked untouched.
    lastModified: revision.updatedAt,
  };
}

/**
 * The revision a row is currently published at, for reading rather than
 * sending — the feed's view, where nothing is being advanced.
 *
 * Falls back through decided_at to created_at for rows written before
 * migration 012, which is exactly the LAST-MODIFIED those rows carry today, so
 * nothing already sitting correctly in a calendar is disturbed by the upgrade.
 */
function currentRevision(leave: LeaveRow): Revision {
  return {
    sequence: leave.ics_sequence,
    updatedAt: leave.ics_updated_at ?? leave.decided_at ?? leave.created_at ?? new Date().toISOString(),
  };
}

/**
 * Record that approved leave is now published, and hand back the invitation
 * for the approval email to carry.
 *
 * Two jobs rather than one, and the order matters. The bookkeeping — advancing
 * the sequence — happens whenever the integration is connected, *including*
 * when invitation emails are switched off, because the subscription feed
 * publishes this request at that same sequence and the withdrawal that may
 * follow has to out-rank it. Gating the bump on `sendInvites`, as this used
 * to, left feed-only workspaces stuck at sequence 0 forever: every booking and
 * its own cancellation carried the same number, so no client would ever act on
 * the cancellation.
 *
 * Returns null whenever the integration is switched off, invitations are
 * disabled, or the sequence bump failed — every one of which means "send the
 * ordinary email without an attachment", not "fail". The feed still carries
 * the booking in all three cases.
 */
export async function publishApprovedLeave(
  leaveId: string
): Promise<CalendarAttachment | null> {
  try {
    const settings = await loadCalendarSettings();
    if (!settings.connected) return null;

    const loaded = await loadLeave(leaveId);
    if (!loaded) return null;

    const revision = await advanceEvent(loaded.leave, { withdrawing: false });
    if (revision === null) return null;

    if (!settings.sendInvites) return null;

    const event = toEvent(loaded.leave, loaded.person, revision);
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
    console.warn("[calendar] could not publish approved leave:", e);
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
 * Returns null when the integration is disconnected, or when the request was
 * not approved a moment ago — the caller's `wasApproved` is the whole test,
 * and it is what keeps a stray attachment off the rejection email for every
 * pending request an admin turns down.
 *
 * It deliberately does NOT also require that a sequence was ever advanced.
 * That extra condition was here, and it was a bug: leave approved during any
 * period when the sequence was not being advanced — before invitations were
 * switched on, or before the integration was connected — was still published
 * by the feed, so a calendar was holding it. Refusing to withdraw it because
 * the counter said zero left exactly that entry stranded forever, which is the
 * one outcome this whole file exists to prevent.
 *
 * Deliberately *not* gated on `sendInvites`, unlike the invitation path. That
 * switch governs whether new entries are created; a cancellation is cleanup
 * for one that already exists. Skipping it because the switch has since been
 * turned off would strand a day off in somebody's calendar for leave that has
 * been cancelled or moved — blocking their availability for dates nobody has
 * agreed to, with nothing in the app to explain it.
 *
 * The sequence bump this performs is what the *feed* leans on too, and it
 * happens even when no email is sent: from here on the request publishes as a
 * tombstone, at a sequence that out-ranks the booking it revokes.
 *
 * Disconnecting the integration entirely is the one case that does stop this,
 * because the disconnect dialog explicitly promises entries already filed are
 * left alone.
 */
async function prepareCancellation(
  leaveId: string,
  opts: { wasApproved: boolean; occurrence?: Occurrence }
): Promise<{
  calendar: CalendarAttachment & { method: "CANCEL" };
  person: { full_name: string; email: string };
  leave: LeaveRow;
} | null> {
  // Whether an event exists to withdraw is a question about the status this
  // request held a moment ago, which only the caller knows — by the time this
  // runs the row already says "cancelled". Asking the row would either miss a
  // live entry or invent one: a request edited out of approved has already had
  // its entry withdrawn, and cancelling it again would attach the revocation
  // of an event nobody was ever sent.
  if (!opts.wasApproved) return null;

  const settings = await loadCalendarSettings();
  if (!settings.connected) return null;

  const loaded = await loadLeave(leaveId);
  if (!loaded) return null;

  const revision = await advanceEvent(loaded.leave, { withdrawing: true });
  if (revision === null) return null;

  const event = toEvent(loaded.leave, loaded.person, revision);
  // Clients match a cancellation on UID, so this is not what makes the event
  // disappear — but a CANCEL should still mirror the event it revokes, and the
  // same dates go into the email the employee reads.
  if (opts.occurrence) {
    event.startDate = opts.occurrence.startDate;
    event.endDate = opts.occurrence.endDate;
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
 * Withdraw published leave, and hand back the cancellation for an email that
 * is going out anyway — an admin cancelling approved leave, where the employee
 * is already being told.
 *
 * Like its opposite number {@link publishApprovedLeave}, the bookkeeping is
 * the part that always happens: the feed stops carrying this request as a
 * booking and starts carrying it as a tombstone whether or not the returned
 * attachment is used.
 */
export async function withdrawApprovedLeave(
  leaveId: string,
  opts: { wasApproved: boolean; occurrence?: Occurrence }
): Promise<CalendarAttachment | null> {
  try {
    const prepared = await prepareCancellation(leaveId, opts);
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
    // Only ever called for leave that was approved a moment ago — editing a
    // pending request changes nothing any calendar has seen.
    const prepared = await prepareCancellation(leaveId, { wasApproved: true, occurrence });
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
 * Resolve a feed token to the person it belongs to, plus every entry their
 * calendar should be holding — and, just as importantly, every entry it should
 * no longer be holding.
 *
 * Why cancellations are published rather than simply left out
 * -----------------------------------------------------------
 * This used to select approved leave and nothing else, so a cancelled day off
 * was expressed as an absence: the event stopped appearing and each client was
 * left to work out what that meant. Google Calendar and Apple Calendar
 * reconcile against the whole document and delete what has gone, so they were
 * right within a refresh. Outlook merges — it adds events it has not seen and
 * updates ones it has, and an event that vanishes from the source is left in
 * place indefinitely. The employee stayed marked out of office in Outlook and
 * Teams for leave that had been cancelled, and re-subscribing was the only fix.
 *
 * So the feed now says it out loud. Anything the calendar might be holding
 * that is no longer true is published as a STATUS:CANCELLED entry under the
 * UID it was filed as, which is the one statement all three clients act on.
 *
 * Which UIDs get a tombstone
 * --------------------------
 * A request can have been filed under more than one UID over its life: every
 * withdrawal moves its generation on, so an edited-and-re-approved booking is
 * a genuinely new event and the old identity is left behind. Rather than track
 * which of them a given client saw, the rule is simply that exactly one UID
 * per request may be live and every other one is cancelled. Cancelling a UID a
 * client never held is a no-op everywhere; missing one it does hold is the bug
 * this exists to fix.
 *
 * Requests no calendar has ever seen — rejected while still pending, never
 * approved — are left out entirely rather than tombstoned, so the document
 * does not fill up with the withdrawal of things that never existed.
 *
 * The token is matched with a plain equality filter on a unique column, so a
 * wrong one finds nothing and the route answers 404 — no distinction is drawn
 * between "no such token" and "token for a person with no leave", because
 * telling those apart would let someone probe for valid tokens.
 */
export async function loadFeedByToken(token: string): Promise<{
  person: { full_name: string };
  entries: FeedEntry[];
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
  //
  // It doubles as the retention period for tombstones, which is the reason to
  // keep it this generous: a cancellation has to stay in the document long
  // enough for every subscriber to poll at least once, and a laptop that was
  // shut for a fortnight still has to hear about it.
  const from = `${new Date().getFullYear() - 1}-01-01`;

  const { data: rows } = await readLeave<LeaveRow[]>((columns) =>
    supabase
      .from("leave_requests")
      // Every status, not just approved — a cancelled request is exactly the
      // one this feed has something to say about.
      .select(columns)
      .eq("user_id", person.id)
      .gte("end_date", from)
      .order("start_date", { ascending: true })
  );

  const identity = { full_name: person.full_name, email: person.email };
  const entries = (rows ?? []).flatMap((row) => feedEntriesFor(row, identity));

  return { person: { full_name: person.full_name }, entries };
}

/**
 * One request, as the calendar should see it: at most one live event, plus a
 * withdrawal for every identity it has been filed under that is no longer
 * true.
 *
 * How far to go depends entirely on the status, and each of the three answers
 * is different for a reason worth stating.
 */
function feedEntriesFor(
  row: LeaveRow,
  person: { full_name: string; email: string }
): FeedEntry[] {
  const generation = generationOf(row);
  const revision = currentRevision(row);
  const event = toEvent(row, person, revision);

  // Approved: the booking itself, published under the generation it now
  // carries, and every generation it has left behind on the way here. Note
  // there is no test on the sequence — an approved request is in this feed
  // unconditionally, which is what makes "the calendar is holding it" a
  // question the rest of this function can answer from the status alone.
  if (row.status === "approved") {
    return [event, ...withdrawals(event, revision.sequence, generation - 1)];
  }

  // Pending: withdrawn for now, but `generation` is reserved for the approval
  // that may still be coming, so the tombstones stop one short of it.
  //
  // Reaching one generation further would be the worst bug in this file. A
  // calendar that has seen a cancellation for a UID tombstones it and drops
  // any later invitation carrying it, rather than re-creating the event — so
  // cancelling the generation the next approval is going to arrive under
  // means re-approved leave silently never comes back. That is precisely the
  // failure migration 011 exists to prevent, and the feed can reintroduce it
  // from this line if the bound is wrong.
  if (row.status === "pending") {
    return withdrawals(event, revision.sequence, generation - 1);
  }

  // Cancelled or rejected. Terminal: no path in the app moves a request out of
  // either status, so nothing will ever be published under it again and every
  // generation can safely be withdrawn — including the current one, which is
  // the generation the calendar is still holding whenever the withdrawal path
  // did not run at all.
  //
  // The sequence is advanced by one purely for this rendering. A withdrawal
  // only lands if it out-ranks the booking it revokes, and a request that was
  // published but never withdrawn still sits at the sequence its own
  // CONFIRMED went out under — so emitting the tombstone at that same number
  // would be ignored as stale by every client, and the entry would stay put.
  // Nothing else is ever published for this request, so there is no later copy
  // for the bump to collide with.
  return withdrawals(event, revision.sequence + 1, generation);
}

/**
 * Withdrawals for generations 0 through `upTo`, all carrying `sequence`.
 *
 * The dates are whatever the request says now, which for an edited booking is
 * not where the abandoned entry was filed. That is fine and cannot be
 * otherwise: clients match a cancellation on UID alone, and the dates a
 * superseded generation went out under are not recorded anywhere.
 */
function withdrawals(event: LeaveEvent, sequence: number, upTo: number): FeedEntry[] {
  const entries: FeedEntry[] = [];
  for (let generation = 0; generation <= upTo; generation++) {
    entries.push({ ...event, generation, sequence, cancelled: true });
  }
  return entries;
}
