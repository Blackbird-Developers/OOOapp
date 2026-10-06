import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import {
  FIRST_TRACKED_YEAR,
  type DayUnit,
  type Employment,
  type LeavePolicy,
  type LeaveRow,
  type LeaveTypeRule,
  type LimitKind,
} from "@/lib/leave-rules";

/**
 * Loading leave policies (templates) and who follows which.
 *
 * Migration 013 is run by hand, so every loader works either side of it.
 * Before it runs there is no catalogue and no templates: the app behaves
 * exactly as it always has, with annual and sick leave and each person's
 * allowance from their profile, presented through the same `LeavePolicy`
 * shape so nothing downstream needs to know which world it is in.
 */

export type LeaveType = { key: string; name: string; sortOrder: number };

/** The only types that exist before migration 013, named as the catalogue names them. */
export const BUILT_IN_TYPES: LeaveType[] = [
  { key: "annual", name: "Annual leave", sortOrder: 10 },
  { key: "sick", name: "Sick leave", sortOrder: 20 },
];

/** Annual and sick leave are wired into the app (notice periods, balances, calendar colours); the rest are data. */
export const CORE_TYPES = new Set(["annual", "sick"]);

export const LEAVE_TYPE_KEY = /^[a-z][a-z0-9_]{1,40}$/;

type QueryError = { code?: string; message?: string } | null;

/**
 * True when a query failed only because migration 013 hasn't been run:
 * PostgREST can't find a table it adds (PGRST205) or Postgres can't find a
 * column it adds (42703). Anything else is a real failure.
 */
export function isPoliciesMigrationMissing(error: QueryError): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  const aboutPolicies = /leave_types|leave_polic|employment_details/.test(message);
  return aboutPolicies && (error.code === "PGRST205" || error.code === "42703" || error.code === "42P01");
}

/** The message shown wherever the feature is reachable but the migration isn't there. */
export const MIGRATION_MISSING_MESSAGE =
  "Leave policies aren't set up yet. Run supabase/migrations/013_leave_policies.sql in the Supabase SQL editor first.";

const POLICY_COLUMNS =
  "id, name, is_default, seniority_enabled, seniority_every_years, seniority_extra_days, " +
  "first_year_enabled, first_year_days_per_month, carry_over_enabled, carry_over_max_days, " +
  "carry_over_expires, created_at, leave_policy_rules(leave_type, enabled, limit_kind, days, day_unit, note)";

type RuleRow = {
  leave_type: string;
  enabled: boolean;
  limit_kind: LimitKind;
  days: number | string | null;
  day_unit: DayUnit;
  note: string | null;
};

type PolicyRow = {
  id: string;
  name: string;
  is_default: boolean;
  seniority_enabled: boolean;
  seniority_every_years: number;
  seniority_extra_days: number | string;
  first_year_enabled: boolean;
  first_year_days_per_month: number | string;
  carry_over_enabled: boolean;
  carry_over_max_days: number | string;
  carry_over_expires: string | null;
  created_at: string;
  leave_policy_rules: RuleRow[] | null;
};

/**
 * A template in the shape the maths uses. Every catalogue type gets a rule:
 * one the template never set (a type added after it was made) comes through
 * switched off.
 */
function toPolicy(row: PolicyRow, types: LeaveType[]): LeavePolicy {
  const byType = new Map((row.leave_policy_rules ?? []).map((r) => [r.leave_type, r]));
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
    seniority: {
      enabled: row.seniority_enabled,
      everyYears: Number(row.seniority_every_years),
      extraDays: Number(row.seniority_extra_days),
    },
    firstYear: { enabled: row.first_year_enabled, daysPerMonth: Number(row.first_year_days_per_month) },
    carryOver: {
      enabled: row.carry_over_enabled,
      maxDays: Number(row.carry_over_max_days),
      expires: row.carry_over_expires,
    },
    rules: types.map((t): LeaveTypeRule => {
      const r = byType.get(t.key);
      if (!r) {
        return CORE_TYPES.has(t.key)
          ? { type: t.key, name: t.name, enabled: false, limit: "per_year", days: 0, unit: "working", note: null }
          : { type: t.key, name: t.name, enabled: false, limit: "unlimited", days: null, unit: "working", note: null };
      }
      return {
        type: t.key,
        name: t.name,
        enabled: r.enabled,
        limit: r.limit_kind,
        days: r.days === null ? null : Number(r.days),
        unit: r.day_unit,
        note: r.note,
      };
    }),
  };
}

/** Today's behaviour, for before migration 013: the profile's two allowances and nothing else. */
export function legacyPolicy(profile: { annual_allowance?: number | string | null; sick_allowance?: number | string | null } | null): LeavePolicy {
  return {
    id: null,
    name: "Standard",
    isDefault: true,
    seniority: { enabled: false, everyYears: 5, extraDays: 1 },
    firstYear: { enabled: false, daysPerMonth: 1.5 },
    carryOver: { enabled: false, maxDays: 5, expires: null },
    rules: [
      { type: "annual", name: "Annual leave", enabled: true, limit: "per_year", days: Number(profile?.annual_allowance ?? 20), unit: "working", note: null },
      { type: "sick", name: "Sick leave", enabled: true, limit: "per_year", days: Number(profile?.sick_allowance ?? 20), unit: "working", note: null },
    ],
  };
}

export type LeaveSetup =
  | { ready: false; types: LeaveType[] }
  | { ready: true; types: LeaveType[]; policies: LeavePolicy[]; defaultPolicy: LeavePolicy | null };

/** The catalogue and every template. Deduped within one server render. */
export const getLeaveSetup = cache(async (): Promise<LeaveSetup> => {
  const supabase = await createServerClient();
  const [typesRes, policiesRes] = await Promise.all([
    supabase.from("leave_types").select("key, name, sort_order").order("sort_order").order("name"),
    supabase.from("leave_policies").select(POLICY_COLUMNS).order("created_at"),
  ]);

  if (typesRes.error || policiesRes.error) {
    const error = typesRes.error ?? policiesRes.error;
    if (isPoliciesMigrationMissing(error)) return { ready: false, types: BUILT_IN_TYPES };
    throw new Error(`Couldn't load leave policies: ${error?.message}`);
  }

  const types: LeaveType[] = (typesRes.data ?? []).map((t) => ({
    key: t.key,
    name: t.name,
    sortOrder: t.sort_order,
  }));
  const policies = ((policiesRes.data ?? []) as unknown as PolicyRow[]).map((row) => toPolicy(row, types));
  return { ready: true, types, policies, defaultPolicy: policies.find((p) => p.isDefault) ?? null };
});

/**
 * A leave type's display name, read through the caller's client.
 *
 * Not `getLeaveSetup()`: that reads with the signed-in session, and a press in
 * Slack has none, so every type would fall back to its raw key.
 */
export async function leaveTypeName(
  supabase: SupabaseClient,
  orgId: string,
  key: string
): Promise<string> {
  const { data } = await supabase
    .from("leave_types")
    .select("key, name")
    .eq("organization_id", orgId)
    .eq("key", key)
    .maybeSingle();
  return typeNamer(data ? [{ key: data.key, name: data.name, sortOrder: 0 }] : BUILT_IN_TYPES)(key);
}

/** Display names by key, falling back to a readable version of the key. */
export function typeNamer(types: LeaveType[]): (key: string) => string {
  const names = new Map(types.map((t) => [t.key, t.name]));
  return (key) => names.get(key) ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
}

export type LeaveContext = {
  ready: boolean;
  types: LeaveType[];
  policy: LeavePolicy;
  employment: Employment;
  /** Id of the template they were added to, or null when following the default. */
  memberOf: string | null;
};

type ProfileRow = {
  id: string;
  created_at: string;
  annual_allowance?: number | string | null;
  sick_allowance?: number | string | null;
};

type EmploymentRow = { user_id: string; start_date: string | null; prior_experience_months: number | null };

function toEmployment(profile: ProfileRow | null, details: EmploymentRow | null): Employment {
  return {
    startDate: details?.start_date ?? null,
    priorExperienceMonths: Number(details?.prior_experience_months ?? 0),
    joinedOn: (profile?.created_at ?? `${FIRST_TRACKED_YEAR}-01-01`).slice(0, 10),
  };
}

function contextFor(
  setup: LeaveSetup,
  profile: ProfileRow | null,
  memberOf: string | null,
  details: EmploymentRow | null = null
): LeaveContext {
  if (!setup.ready) {
    return { ready: false, types: setup.types, policy: legacyPolicy(profile), employment: toEmployment(profile, null), memberOf: null };
  }
  const policy =
    (memberOf && setup.policies.find((p) => p.id === memberOf)) ||
    setup.defaultPolicy ||
    // No default should never happen (the default can't be deleted), but if it
    // does, fall back to the profile numbers rather than zero days for everyone.
    legacyPolicy(profile);
  return { ready: true, types: setup.types, policy, employment: toEmployment(profile, details), memberOf };
}

/** One person's template and employment details. */
export async function getLeaveContext(userId: string): Promise<LeaveContext> {
  const setup = await getLeaveSetup();
  const supabase = await createServerClient();

  if (!setup.ready) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, created_at, annual_allowance, sick_allowance")
      .eq("id", userId)
      .single();
    return contextFor(setup, profile as ProfileRow | null, null);
  }

  const [{ data: membership }, { data: profile }, { data: details }] = await Promise.all([
    supabase.from("leave_policy_members").select("policy_id").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("id, created_at, annual_allowance, sick_allowance").eq("id", userId).single(),
    supabase
      .from("employment_details")
      .select("user_id, start_date, prior_experience_months")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  return contextFor(
    setup,
    profile as ProfileRow | null,
    membership?.policy_id ?? null,
    details as EmploymentRow | null
  );
}

export type PersonLeave = LeaveContext & {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "employee";
};

/** Everyone's template and employment details, for admin pages. */
export async function getEveryonesLeaveContext(): Promise<{ setup: LeaveSetup; people: PersonLeave[] }> {
  const setup = await getLeaveSetup();
  const supabase = await createServerClient();
  const base = "id, full_name, email, role, created_at, annual_allowance, sick_allowance";

  if (!setup.ready) {
    const { data } = await supabase.from("profiles").select(base).order("full_name");
    const people = (data ?? []).map((p) => ({
      ...contextFor(setup, p as ProfileRow, null),
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      role: p.role,
    }));
    return { setup, people };
  }

  const [{ data: profiles, error }, { data: memberships }, { data: details }] = await Promise.all([
    supabase.from("profiles").select(base).order("full_name"),
    supabase.from("leave_policy_members").select("user_id, policy_id"),
    supabase.from("employment_details").select("user_id, start_date, prior_experience_months"),
  ]);
  if (error) throw new Error(`Couldn't load employees: ${error.message}`);
  const memberOf = new Map((memberships ?? []).map((m) => [m.user_id, m.policy_id]));
  const detailsOf = new Map(((details ?? []) as EmploymentRow[]).map((d) => [d.user_id, d]));
  const people = (profiles ?? []).map((p) => ({
    ...contextFor(setup, p as ProfileRow, memberOf.get(p.id) ?? null, detailsOf.get(p.id) ?? null),
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    role: p.role,
  }));
  return { setup, people };
}

/**
 * Approved and pending leave the balance maths needs: back to the first
 * tracked year, because carry-over walks forward from there.
 *
 * Read in pages. Supabase caps a response at 1000 rows by default, and a
 * silently shortened list here would quietly hand people days they've used.
 */
export async function getLeaveRows(userId?: string): Promise<(LeaveRow & { user_id: string })[]> {
  const supabase = await createServerClient();
  const PAGE = 1000;
  const rows: (LeaveRow & { user_id: string })[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("leave_requests")
      .select("id, user_id, type, status, start_date, days_count")
      .in("status", ["approved", "pending"])
      .gte("start_date", `${FIRST_TRACKED_YEAR}-01-01`)
      .order("id")
      .range(from, from + PAGE - 1);
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query;
    if (error) throw new Error(`Couldn't load leave: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

// ---------------------------------------------------------------------------
// Starting points for a new template
// ---------------------------------------------------------------------------

export type PolicyPreset = "kosovo" | "blank";

type PresetRule = Omit<LeaveTypeRule, "type" | "name">;

export type PresetDefinition = {
  seniority: LeavePolicy["seniority"];
  firstYear: LeavePolicy["firstYear"];
  carryOver: LeavePolicy["carryOver"];
  rules: Record<string, PresetRule>;
};

/**
 * "Full company policy" is the Leave & Absence Policy Summary as sent over: every
 * type switched on with its numbers and conditions written out for employees.
 * "Blank" is today's two allowances and nothing else.
 */
export const POLICY_PRESETS: Record<PolicyPreset, PresetDefinition> = {
  kosovo: {
    seniority: { enabled: true, everyYears: 5, extraDays: 1 },
    firstYear: { enabled: true, daysPerMonth: 1.5 },
    carryOver: { enabled: false, maxDays: 5, expires: null },
    rules: {
      annual: { enabled: true, limit: "per_year", days: 20, unit: "working", note: null },
      sick: {
        enabled: true, limit: "per_year", days: 20, unit: "working",
        note: "Paid by the employer at 70% with a valid medical certificate.",
      },
      maternity: {
        enabled: true, limit: "per_request", days: 365, unit: "calendar",
        note: "Up to 12 months. It can start up to 45 days before the birth, and must start 28 days before at the latest. The first 6 months are paid by the employer at 70%, the next 3 by the government at 50%, and the last 3 are unpaid.",
      },
      paternity: {
        enabled: true, limit: "per_request", days: 3, unit: "working",
        note: "3 paid days after a birth or adoption. You can also take 2 unpaid weeks before the child turns 3: request those as unpaid leave.",
      },
      marriage: { enabled: true, limit: "per_request", days: 5, unit: "working", note: "5 paid days for your wedding." },
      bereavement: {
        enabled: true, limit: "per_request", days: 5, unit: "working",
        note: "5 paid days when an immediate family member dies.",
      },
      blood_donation: {
        enabled: true, limit: "per_request", days: 1, unit: "working",
        note: "1 paid day each time you donate blood voluntarily.",
      },
      unpaid: {
        enabled: true, limit: "unlimited", days: null, unit: "working",
        note: "Agreed with your admin case by case.",
      },
    },
  },
  blank: {
    seniority: { enabled: false, everyYears: 5, extraDays: 1 },
    firstYear: { enabled: false, daysPerMonth: 1.5 },
    carryOver: { enabled: false, maxDays: 5, expires: null },
    rules: {
      annual: { enabled: true, limit: "per_year", days: 20, unit: "working", note: null },
      sick: { enabled: true, limit: "per_year", days: 20, unit: "working", note: null },
    },
  },
};

/** The columns a template's settings live in. */
export function policySettingsRow(p: Pick<LeavePolicy, "seniority" | "firstYear" | "carryOver">) {
  return {
    seniority_enabled: p.seniority.enabled,
    seniority_every_years: p.seniority.everyYears,
    seniority_extra_days: p.seniority.extraDays,
    first_year_enabled: p.firstYear.enabled,
    first_year_days_per_month: p.firstYear.daysPerMonth,
    carry_over_enabled: p.carryOver.enabled,
    carry_over_max_days: p.carryOver.maxDays,
    carry_over_expires: p.carryOver.expires,
  };
}

export function ruleRow(policyId: string, type: string, rule: PresetRule) {
  return {
    policy_id: policyId,
    leave_type: type,
    enabled: rule.enabled,
    limit_kind: rule.limit,
    days: rule.limit === "unlimited" ? null : rule.days,
    day_unit: rule.unit,
    note: rule.note?.trim() ? rule.note.trim() : null,
  };
}

/** "Parent's leave" → "parents_leave", unique against `taken`. */
export function leaveTypeKey(name: string, taken: Set<string>): string {
  const slug =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^[^a-z]+/, "")
      .slice(0, 36) || "leave";
  const base = slug.length < 2 ? `${slug}_leave` : slug;
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  return key;
}
