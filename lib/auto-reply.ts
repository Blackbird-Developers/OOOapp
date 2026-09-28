import { createHash } from "node:crypto";
import { format, parseISO } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_TIME_ZONE, nextWorkingDay, todayISOIn, zonedInstant, type HalfKind } from "@/lib/days";
import { googleCredentials, isImpersonatable, type GoogleCredentials } from "@/lib/google-auth";
import { describeGoogleError, putVacation, type VacationSettings } from "@/lib/gmail";
import { loadAutoReplySettings, type AutoReplySettings } from "@/lib/auto-reply-settings";

/**
 * The out-of-office auto-reply: what each mailbox should be saying, and how it
 * gets there.
 *
 * The shape of the whole feature in one paragraph. Every time somebody leave
 * changes, the app recomputes what that person responder OUGHT to say, compares
 * it to what it last wrote, and only calls Gmail when the two differ. Gmail
 * itself owns the clock — it is given a start and an end instant and switches
 * the responder on and off at them — so leave approved in March for August
 * needs nothing to happen in between. That is why this feature has no cron.
 *
 * Everything here is best-effort by construction, exactly like the calendar
 * integration next door: the leave decision is already committed before any of
 * this runs, so a Gmail failure is recorded and swallowed rather than turning a
 * successful approval into a 500.
 *
 * Server-only: service-role client and service-account credentials throughout.
 */

/** A colleague the reply points the sender at. */
export type CoverContact = { name: string; email: string };

/** At most this many names in one reply — a list of five helps nobody. */
const MAX_CONTACTS = 3;

type LeaveWindow = {
  id: string;
  startDate: string;
  endDate: string;
  halfStart: HalfKind;
  halfEnd: HalfKind;
};

export type DesiredState =
  | { enabled: false; reason: string }
  | {
      enabled: true;
      leaveRequestId: string;
      startTime: Date;
      endTime: Date;
      subject: string;
      bodyText: string;
      bodyHtml: string;
      contacts: CoverContact[];
      returnDate: string;
      fingerprint: string;
    };

export type SyncOutcome = {
  userId: string;
  /** What the mailbox now says, as far as the app knows. */
  enabled: boolean;
  /** No call was needed — the mailbox already matched. */
  unchanged: boolean;
  error: string | null;
  reason?: string;
};

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Bring one person responder in line with their leave.
 *
 * Silently does nothing when the integration is switched off. That is not the
 * same as clearing: disconnecting stops the app writing, and the separate
 * `clearAllAutoReplies` is what actually takes existing responders back down.
 */
export async function syncAutoReplyFor(userId: string): Promise<SyncOutcome | null> {
  const orgId = await organizationOf(userId);
  if (!orgId) return null;

  const settings = await loadAutoReplySettings(orgId);
  if (!settings.connected) return null;

  const credentials = googleCredentials(orgId);
  if (!credentials) {
    console.warn("[auto-reply] connected but GOOGLE_SA_* credentials are missing.");
    return null;
  }

  return syncOne(orgId, userId, settings, credentials);
}

/**
 * What to run after any change to somebody leave.
 *
 * Syncs the person themselves, and then re-syncs the group-mates whose
 * responder is currently naming them. Without that second step a reply could
 * keep telling clients to contact a colleague who has since booked the same
 * week off — the one way this feature could go stale on its own, and the
 * reason it can get away without a reconciling cron.
 *
 * Never throws. Callers are mid-request on an already-committed decision.
 */
export async function syncAfterLeaveChange(userId: string): Promise<void> {
  try {
    const orgId = await organizationOf(userId);
    if (!orgId) return;

    const settings = await loadAutoReplySettings(orgId);
    if (!settings.connected) return;

    const credentials = googleCredentials(orgId);
    if (!credentials) return;

    await syncOne(orgId, userId, settings, credentials);

    // Group-mates share the company: migration 015 keys group membership by
    // organization, so a group can never hold someone from elsewhere.
    for (const mateId of await activeGroupMates(userId)) {
      await syncOne(orgId, mateId, settings, credentials);
    }
  } catch (e) {
    console.warn("[auto-reply] sync after leave change failed:", describeGoogleError(e));
  }
}

/**
 * Take down every responder the app is currently holding up.
 *
 * What Disconnect does, and the one place this feature departs from the
 * calendar integration precedent of leaving existing entries alone. A calendar
 * entry someone already accepted is a record of a real day off; a responder is
 * the app actively speaking in an employee voice, every hour of every day, to
 * anyone who writes in. Switching the integration off has to stop that, or the
 * button does not mean what it says.
 *
 * Bounded by construction: it only visits mailboxes with a state row saying the
 * app enabled one, which is a handful of people rather than the whole company.
 */
export async function clearAllAutoReplies(orgId: string): Promise<{ cleared: number; failed: number }> {
  const credentials = googleCredentials(orgId);
  if (!credentials) return { cleared: 0, failed: 0 };

  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from("auto_reply_state")
    .select("user_id, profiles:user_id(email)")
    .eq("organization_id", orgId)
    .eq("enabled", true);

  if (error) {
    console.error("[auto-reply] could not list responders to clear:", error.message);
    return { cleared: 0, failed: 0 };
  }

  let cleared = 0;
  let failed = 0;
  for (const row of (rows ?? []) as unknown as { user_id: string; profiles: { email: string } | null }[]) {
    const email = row.profiles?.email;
    if (!email || !isImpersonatable(email, credentials)) continue;
    try {
      await putVacation(email, credentials, { enableAutoReply: false });
      await recordState(row.user_id, { enabled: false, error: null });
      cleared++;
    } catch (e) {
      await recordState(row.user_id, { enabled: true, error: describeGoogleError(e) });
      failed++;
    }
  }
  return { cleared, failed };
}

// ---------------------------------------------------------------------------
// The one-person path
// ---------------------------------------------------------------------------

async function syncOne(
  orgId: string,
  userId: string,
  settings: AutoReplySettings,
  credentials: GoogleCredentials
): Promise<SyncOutcome> {
  const profile = await loadProfile(userId);
  if (!profile) return { userId, enabled: false, unchanged: true, error: "No such person." };

  const desired = profile.auto_reply_opt_out
    ? ({ enabled: false, reason: "They have switched auto-replies off." } as DesiredState)
    : await computeDesiredState(orgId, userId, profile.full_name, settings);

  const current = await loadState(userId);

  // Nothing to do, and nothing was ever done. The common case by far: most
  // people have no upcoming leave on any given day.
  if (!desired.enabled && !current?.enabled) {
    return { userId, enabled: false, unchanged: true, error: null, reason: desired.reason };
  }

  // The mailbox already says exactly this. Skipping here is what keeps a
  // group-mate re-sync from firing a Gmail call per person per approval.
  if (
    desired.enabled &&
    current?.enabled &&
    current.fingerprint === desired.fingerprint &&
    sameInstant(current.start_time, desired.startTime) &&
    sameInstant(current.end_time, desired.endTime)
  ) {
    return { userId, enabled: true, unchanged: true, error: null };
  }

  // A mailbox outside the Workspace domain cannot be impersonated at all. Only
  // worth recording when the app actually wanted to set something — otherwise
  // every contractor on a personal address collects a permanent error row.
  if (!isImpersonatable(profile.email, credentials)) {
    const error = `${profile.email} is not in the ${credentials.domain} Workspace, so its auto-reply cannot be set.`;
    if (desired.enabled) await recordState(userId, { enabled: false, error });
    return { userId, enabled: false, unchanged: true, error };
  }

  try {
    await putVacation(profile.email, credentials, vacationPayload(desired, settings));
  } catch (e) {
    const error = describeGoogleError(e);
    console.warn(`[auto-reply] ${profile.email}: ${error}`);
    // Keep the last known enabled flag rather than guessing: a failed write
    // leaves whatever was there before, and claiming otherwise would make
    // Disconnect skip a mailbox that is still replying.
    await recordState(userId, { enabled: current?.enabled ?? false, error });
    return { userId, enabled: current?.enabled ?? false, unchanged: false, error };
  }

  await recordState(userId, {
    enabled: desired.enabled,
    error: null,
    leaveRequestId: desired.enabled ? desired.leaveRequestId : null,
    startTime: desired.enabled ? desired.startTime : null,
    endTime: desired.enabled ? desired.endTime : null,
    fingerprint: desired.enabled ? desired.fingerprint : null,
  });

  return { userId, enabled: desired.enabled, unchanged: false, error: null };
}

/**
 * The complete responder to send.
 *
 * Built in full every time because the Gmail endpoint is a PUT with no PATCH
 * alongside it: anything left out is cleared, so a partial payload would
 * quietly wipe the fields it omitted.
 */
function vacationPayload(desired: DesiredState, settings: AutoReplySettings): VacationSettings {
  if (!desired.enabled) return { enableAutoReply: false };

  return {
    enableAutoReply: true,
    responseSubject: desired.subject,
    responseBodyPlainText: desired.bodyText,
    responseBodyHtml: desired.bodyHtml,
    // Always false. Restricting to known contacts would silence the reply for
    // exactly the people it exists for: a new client writing in for the first
    // time is a stranger to that mailbox address book.
    restrictToContacts: false,
    restrictToDomain: settings.restrictToDomain,
    startTime: String(desired.startTime.getTime()),
    endTime: String(desired.endTime.getTime()),
  };
}

// ---------------------------------------------------------------------------
// What the mailbox ought to say
// ---------------------------------------------------------------------------

export async function computeDesiredState(
  orgId: string,
  userId: string,
  fullName: string,
  settings: AutoReplySettings
): Promise<DesiredState> {
  const leave = await currentOrNextLeave(userId);
  if (!leave) return { enabled: false, reason: "No upcoming approved leave." };

  const startTime = windowStart(leave);
  const endTime = windowEnd(leave);

  // Leave whose last half-day is already behind us. Gmail would accept the
  // window and never act on it; recording it as enabled would be a lie the
  // Integrations card then repeats.
  if (endTime.getTime() <= Date.now()) {
    return { enabled: false, reason: "Their leave has already finished." };
  }

  const holidays = await holidaysAround(orgId, leave.endDate);
  const returnDate = nextWorkingDay(dayAfter(leave.endDate), holidays);
  const contacts = await findCoverContacts(userId, leave);

  const subject = `Out of office — back on ${format(parseISO(returnDate), "EEEE d MMMM")}`;
  const bodyText = plainTextBody({ fullName, returnDate, contacts, settings });
  const bodyHtml = htmlBody({ fullName, returnDate, contacts, settings });

  return {
    enabled: true,
    leaveRequestId: leave.id,
    startTime,
    endTime,
    subject,
    bodyText,
    bodyHtml,
    contacts,
    returnDate,
    fingerprint: fingerprintOf(subject, bodyText, settings),
  };
}

/**
 * The leave this responder is for: the earliest approved request that has not
 * finished yet.
 *
 * Gmail holds one responder per mailbox, so back-to-back bookings cannot all
 * be represented. The nearest one is the only defensible choice — it is the
 * one that is true first, and each later booking gets its turn the moment the
 * earlier one ends and the next change triggers a re-sync.
 */
async function currentOrNextLeave(userId: string): Promise<LeaveWindow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .select("id, start_date, end_date, half_start, half_end")
    .eq("user_id", userId)
    .eq("status", "approved")
    .gte("end_date", todayISOIn())
    .order("start_date", { ascending: true })
    .limit(1);

  if (error) {
    console.warn("[auto-reply] could not read leave:", error.message);
    return null;
  }
  const row = data?.[0];
  if (!row) return null;

  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    halfStart: (row.half_start ?? "full") as HalfKind,
    halfEnd: (row.half_end ?? "full") as HalfKind,
  };
}

/**
 * Half days are honoured at both ends, in Kosovo time.
 *
 * Someone who booked the afternoon off is at their desk all morning, and a
 * responder telling clients otherwise from midnight would be actively wrong
 * for half a working day.
 */
function windowStart(leave: LeaveWindow): Date {
  return leave.halfStart === "pm"
    ? zonedInstant(leave.startDate, 12, 0)
    : zonedInstant(leave.startDate, 0, 0);
}

function windowEnd(leave: LeaveWindow): Date {
  return leave.halfEnd === "am"
    ? zonedInstant(leave.endDate, 12, 0)
    : zonedInstant(leave.endDate, 23, 59);
}

/**
 * Group-mates who are actually around.
 *
 * The Hierarchy groups from migration 007 are already the record of who covers
 * for whom, so this reads them rather than introducing a second org chart for
 * admins to keep in step. Anyone whose own approved leave overlaps the window
 * is dropped: pointing a client at a second person who is also away is worse
 * than naming nobody, because it costs them another email to find out.
 */
async function findCoverContacts(userId: string, leave: LeaveWindow): Promise<CoverContact[]> {
  const supabase = createAdminClient();

  const { data: myGroups, error } = await supabase
    .from("conflict_group_members")
    .select("group_id")
    .eq("user_id", userId);

  if (error || !myGroups?.length) return [];

  const { data: memberRows } = await supabase
    .from("conflict_group_members")
    .select("user_id")
    .in("group_id", myGroups.map((g) => g.group_id));

  const candidateIds = [
    ...new Set((memberRows ?? []).map((m) => m.user_id).filter((id) => id !== userId)),
  ];
  if (candidateIds.length === 0) return [];

  const [{ data: profiles }, { data: theirLeave }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, auto_reply_opt_out")
      .in("id", candidateIds),
    supabase
      .from("leave_requests")
      .select("user_id")
      .in("user_id", candidateIds)
      .eq("status", "approved")
      .lte("start_date", leave.endDate)
      .gte("end_date", leave.startDate),
  ]);

  const alsoAway = new Set((theirLeave ?? []).map((r) => r.user_id));

  return (profiles ?? [])
    .filter((p) => !alsoAway.has(p.id))
    .map((p) => ({ name: p.full_name as string, email: p.email as string }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_CONTACTS);
}

/** Group-mates who currently have a responder the app put up. */
async function activeGroupMates(userId: string): Promise<string[]> {
  const supabase = createAdminClient();

  const { data: myGroups } = await supabase
    .from("conflict_group_members")
    .select("group_id")
    .eq("user_id", userId);
  if (!myGroups?.length) return [];

  const { data: memberRows } = await supabase
    .from("conflict_group_members")
    .select("user_id")
    .in("group_id", myGroups.map((g) => g.group_id));

  const mateIds = [
    ...new Set((memberRows ?? []).map((m) => m.user_id).filter((id) => id !== userId)),
  ];
  if (mateIds.length === 0) return [];

  const { data: states } = await supabase
    .from("auto_reply_state")
    .select("user_id")
    .in("user_id", mateIds)
    .eq("enabled", true);

  return (states ?? []).map((s) => s.user_id as string);
}

/** Public holidays near the end of the leave, for the "back on" calculation. */
async function holidaysAround(orgId: string, endDate: string): Promise<string[]> {
  const supabase = createAdminClient();
  const from = dayAfter(endDate);
  const { data } = await supabase
    .from("public_holidays")
    .select("date")
    .eq("organization_id", orgId)
    .gte("date", from)
    .lte("date", addDaysISO(from, 14));
  return (data ?? []).map((h: { date: string }) => h.date);
}

/**
 * What this person reply would say, without touching their mailbox.
 *
 * Backs the Preview button on the Integrations card. An auto-reply is the one
 * thing this app writes that a stranger reads, in an employee name, with
 * nobody reviewing it first — so being able to read the exact words before
 * switching it on matters more here than anywhere else in the app.
 *
 * Uses their real leave when they have some, and a worked example a week out
 * when they do not. The cover contacts are real either way, because "who would
 * this actually name" is the question being asked.
 */
export async function previewAutoReply(
  orgId: string,
  userId: string,
  fullName: string
): Promise<{
  sample: boolean;
  subject: string;
  bodyText: string;
  contacts: CoverContact[];
  returnDate: string;
}> {
  const settings = await loadAutoReplySettings(orgId);
  const real = await computeDesiredState(orgId, userId, fullName, settings);

  if (real.enabled) {
    return {
      sample: false,
      subject: real.subject,
      bodyText: real.bodyText,
      contacts: real.contacts,
      returnDate: real.returnDate,
    };
  }

  const startDate = addDaysISO(todayISOIn(), 7);
  const endDate = addDaysISO(startDate, 4);
  const window: LeaveWindow = {
    id: "preview",
    startDate,
    endDate,
    halfStart: "full",
    halfEnd: "full",
  };

  const holidays = await holidaysAround(orgId, endDate);
  const returnDate = nextWorkingDay(dayAfter(endDate), holidays);
  const contacts = await findCoverContacts(userId, window);

  return {
    sample: true,
    subject: `Out of office — back on ${format(parseISO(returnDate), "EEEE d MMMM")}`,
    bodyText: plainTextBody({ fullName, returnDate, contacts, settings }),
    contacts,
    returnDate,
  };
}

// ---------------------------------------------------------------------------
// The message
// ---------------------------------------------------------------------------

type BodyInput = {
  fullName: string;
  returnDate: string;
  contacts: CoverContact[];
  settings: AutoReplySettings;
};

/**
 * What the reply says.
 *
 * Note what is absent: the leave TYPE, in either version. The Slack digest and
 * the calendar entries both withhold it because sick leave is health data, and
 * this is the loudest channel of the three — it answers strangers, clients and
 * recruiters automatically, forever, with no one reviewing it. "Out of office"
 * is all any of them need.
 */
function plainTextBody({ fullName, returnDate, contacts, settings }: BodyInput): string {
  const lines = [
    "Hello,",
    "",
    `Thank you for your email. I am out of the office at the moment and back on ${longDate(returnDate)}. I am not picking up messages until then.`,
    "",
    coverSentence(contacts, settings),
  ];

  if (settings.extraNote) lines.push("", settings.extraNote);
  lines.push("", "Best regards,", firstName(fullName));

  return lines.join("\n");
}

function htmlBody({ fullName, returnDate, contacts, settings }: BodyInput): string {
  const paragraphs = [
    "Hello,",
    `Thank you for your email. I am out of the office at the moment and back on <strong>${escapeHtml(longDate(returnDate))}</strong>. I am not picking up messages until then.`,
    coverSentenceHtml(contacts, settings),
  ];

  if (settings.extraNote) paragraphs.push(escapeHtml(settings.extraNote));
  paragraphs.push(`Best regards,<br>${escapeHtml(firstName(fullName))}`);

  return paragraphs.map((p) => `<p>${p}</p>`).join("\n");
}

/**
 * Who to write to instead, in three descending degrees of helpfulness.
 *
 * A named colleague who is actually at their desk is the useful answer. The
 * shared fallback address is the next best, for the cases the Hierarchy groups
 * cannot cover — both members of a pair away, or somebody in no group. Naming
 * nobody is the last resort, and it still beats inventing a contact.
 */
function coverSentence(contacts: CoverContact[], settings: AutoReplySettings): string {
  if (contacts.length > 0) {
    const list = joinNames(contacts.map((c) => `${c.name} (${c.email})`));
    return `For anything urgent in the meantime, please contact ${list}.`;
  }
  if (settings.fallbackEmail) {
    return `For anything urgent in the meantime, please write to ${settings.fallbackEmail} and a colleague will pick it up.`;
  }
  return "Your message will be answered as soon as I am back.";
}

function coverSentenceHtml(contacts: CoverContact[], settings: AutoReplySettings): string {
  if (contacts.length > 0) {
    const list = joinNames(contacts.map((c) => `${escapeHtml(c.name)} (${mailto(c.email)})`));
    return `For anything urgent in the meantime, please contact ${list}.`;
  }
  if (settings.fallbackEmail) {
    return `For anything urgent in the meantime, please write to ${mailto(settings.fallbackEmail)} and a colleague will pick it up.`;
  }
  return escapeHtml("Your message will be answered as soon as I am back.");
}

function mailto(email: string): string {
  const safe = escapeHtml(email);
  return `<a href="mailto:${safe}">${safe}</a>`;
}

function joinNames(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;
}

/**
 * The reply signs off with a first name.
 *
 * It goes out in that person voice, so "Best regards, Leke" reads as a note
 * they left rather than a system notice about them.
 */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

function longDate(iso: string): string {
  return format(parseISO(iso), "EEEE d MMMM");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Identity of a written responder.
 *
 * Covers the message and the delivery rule, but not the window — the times are
 * compared directly, because a fingerprint would hide a date change behind
 * identical wording whenever leave moves without changing its return day.
 */
function fingerprintOf(subject: string, bodyText: string, settings: AutoReplySettings): string {
  return createHash("sha256")
    .update(`${subject}\n${bodyText}\n${settings.restrictToDomain ? "domain" : "everyone"}`)
    .digest("hex")
    .slice(0, 32);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type ProfileRow = { id: string; email: string; full_name: string; auto_reply_opt_out: boolean };

/** The company someone belongs to, which decides whose settings and credentials apply. */
async function organizationOf(userId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  return (data?.organization_id as string | undefined) ?? null;
}

/**
 * The person, tolerating a deployment where migration 014 has not been run.
 *
 * `auto_reply_opt_out` is one of the two things that migration adds, and an
 * unguarded select on a missing column fails the whole row rather than the one
 * field. The README promises that deploying the code before running the
 * migration is safe, and without this fallback every approval would log "no
 * such person" instead.
 */
async function loadProfile(userId: string): Promise<ProfileRow | null> {
  const supabase = createAdminClient();

  const full = await supabase
    .from("profiles")
    .select("id, email, full_name, auto_reply_opt_out")
    .eq("id", userId)
    .maybeSingle();

  if (!full.error) return (full.data as ProfileRow | null) ?? null;

  const basic = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (basic.error || !basic.data) return null;
  // Nobody can have opted out yet — the column that would record it does not
  // exist — so treating everyone as opted in is the only truthful reading.
  return { ...(basic.data as Omit<ProfileRow, "auto_reply_opt_out">), auto_reply_opt_out: false };
}

type StateRow = {
  enabled: boolean;
  start_time: string | null;
  end_time: string | null;
  fingerprint: string | null;
  error: string | null;
};

async function loadState(userId: string): Promise<StateRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("auto_reply_state")
    .select("enabled, start_time, end_time, fingerprint, error")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // Migration 014 not run. Returning null makes every sync look like a first
    // one, which is wrong but harmless: it writes the same responder again.
    console.warn("[auto-reply] could not read state:", error.message);
    return null;
  }
  return (data as StateRow | null) ?? null;
}

async function recordState(
  userId: string,
  patch: {
    enabled: boolean;
    error: string | null;
    leaveRequestId?: string | null;
    startTime?: Date | null;
    endTime?: Date | null;
    fingerprint?: string | null;
  }
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("auto_reply_state").upsert(
    {
      user_id: userId,
      enabled: patch.enabled,
      error: patch.error,
      leave_request_id: patch.leaveRequestId ?? null,
      start_time: patch.startTime?.toISOString() ?? null,
      end_time: patch.endTime?.toISOString() ?? null,
      fingerprint: patch.fingerprint ?? null,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) console.warn("[auto-reply] could not record state:", error.message);
}

function sameInstant(stored: string | null, wanted: Date): boolean {
  return !!stored && new Date(stored).getTime() === wanted.getTime();
}

function dayAfter(iso: string): string {
  return addDaysISO(iso, 1);
}

function addDaysISO(iso: string, days: number): string {
  const date = parseISO(iso);
  date.setDate(date.getDate() + days);
  return format(date, "yyyy-MM-dd");
}

/** The timezone every window is computed in, for the admin card to state. */
export const AUTO_REPLY_TIME_ZONE = APP_TIME_ZONE;

// ---------------------------------------------------------------------------
// What the admin card reports
// ---------------------------------------------------------------------------

export type AutoReplyStats = {
  /** Responders the app currently has up. */
  active: number;
  /** Mailboxes whose last write failed, with a sample message. */
  failing: number;
  sampleError: string | null;
  /** People who have switched the feature off for themselves. */
  optedOut: number;
  /** Hierarchy groups that exist. Zero means no reply can name anybody. */
  groups: number;
  /** Colleagues on an address outside the Workspace, who cannot be covered. */
  outsideDomain: number;
  /** Migration 014 has not been run. */
  migrationMissing: boolean;
};

/**
 * A read-only picture of the feature for the Integrations card.
 *
 * Exists because every failure this integration has is invisible from the
 * outside. A delegation authorised for the wrong scope, a colleague on a
 * personal address, an empty Hierarchy — none of them throw anywhere an admin
 * would see. The card has to go looking, so this is what it asks.
 */
export async function autoReplyStats(orgId: string): Promise<AutoReplyStats> {
  const supabase = createAdminClient();
  const credentials = googleCredentials(orgId);

  const counted = (res: { count: number | null }) => res.count ?? 0;

  const [activeRes, failingRes, optedOutRes, groupsRes, profilesRes] = await Promise.all([
    supabase
      .from("auto_reply_state")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("enabled", true),
    // The rows themselves rather than a count plus a separate sample query:
    // this table holds at most one row per employee, so fetching the failures
    // outright is one round-trip instead of two for the same two numbers.
    supabase
      .from("auto_reply_state")
      .select("error")
      .eq("organization_id", orgId)
      .not("error", "is", null),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("auto_reply_opt_out", true),
    supabase
      .from("conflict_groups")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    credentials?.domain
      ? supabase.from("profiles").select("email").eq("organization_id", orgId)
      : Promise.resolve({ data: null, error: null }),
  ]);

  // Either of the two things migration 014 adds coming back as an error means
  // it has not been run. Said plainly on the card, because every other number
  // here would otherwise read as a reassuring zero.
  const migrationMissing = !!activeRes.error || !!optedOutRes.error;

  const failures = (failingRes.data ?? []) as { error: string }[];

  const outsideDomain = credentials?.domain
    ? ((profilesRes.data ?? []) as { email: string }[]).filter(
        (p) => !isImpersonatable(p.email, credentials)
      ).length
    : 0;

  return {
    active: counted(activeRes),
    failing: failures.length,
    sampleError: failures[0]?.error ?? null,
    optedOut: counted(optedOutRes),
    groups: counted(groupsRes),
    outsideDomain,
    migrationMissing,
  };
}
