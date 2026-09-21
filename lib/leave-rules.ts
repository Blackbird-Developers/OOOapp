import { addDays, format, parseISO } from "date-fns";

/**
 * Leave policy maths: how many days someone gets, and has left, of each type.
 *
 * Pure on purpose (no database, no React, no path aliases). The API routes,
 * the admin tables and the employee's request form all run these exact
 * functions, so the number a form shows is the number the server enforces.
 *
 * Years are calendar years and a request belongs to the year it starts in,
 * the same convention balances have always used.
 */

export type LimitKind = "per_year" | "per_request" | "unlimited";
export type DayUnit = "working" | "calendar";

/** What a template allows for one leave type. */
export type LeaveTypeRule = {
  type: string;
  name: string;
  enabled: boolean;
  /** per_year: resets on 1 January. per_request: a cap on each request. unlimited: approval decides. */
  limit: LimitKind;
  /** The yearly allowance or per-request cap. Null when unlimited. */
  days: number | null;
  /** Whether weekends and public holidays count. */
  unit: DayUnit;
  /** Shown to employees when they pick the type. */
  note: string | null;
};

export type LeavePolicy = {
  /** Null for the stand-in built from profile allowances before migration 013 runs. */
  id: string | null;
  name: string;
  isDefault: boolean;
  seniority: { enabled: boolean; everyYears: number; extraDays: number };
  firstYear: { enabled: boolean; daysPerMonth: number };
  /** `expires` is a month-day ("06-30") in the year the days carry into; null keeps them all year. */
  carryOver: { enabled: boolean; maxDays: number; expires: string | null };
  /** Every leave type in the catalogue, in display order. Types a template never set come through disabled. */
  rules: LeaveTypeRule[];
};

export type Employment = {
  /** First day at the company (yyyy-MM-dd), if an admin has entered it. */
  startDate: string | null;
  /** Experience from before the company, counted towards seniority. */
  priorExperienceMonths: number;
  /** When the account was created (yyyy-MM-dd). Stands in for the start date when deciding the first year worth carrying over from. */
  joinedOn: string;
};

/** The slice of a leave_requests row the maths needs. */
export type LeaveRow = {
  id?: string;
  type: string;
  status: string;
  start_date: string;
  days_count: number | string;
};

/**
 * Leave history in the app starts in 2026, so that is the first year whose
 * unused days can carry over. Without a floor, every year before the app
 * existed would look like a year of untouched allowance.
 */
export const FIRST_TRACKED_YEAR = 2026;

const round1 = (n: number) => Math.round(n * 10) / 10;
const yearOf = (iso: string) => Number(iso.slice(0, 4));

export function ruleFor(policy: LeavePolicy, type: string): LeaveTypeRule | undefined {
  return policy.rules.find((r) => r.type === type);
}

/** Types an employee on this template can request, in display order. */
export function requestableRules(policy: LeavePolicy): LeaveTypeRule[] {
  return policy.rules.filter((r) => r.enabled);
}

/**
 * Whole months worked from `startISO` up to and including `asOfISO`. A month
 * counts on its last day: someone starting 1 July has one month on 31 July.
 */
export function monthsWorked(startISO: string, asOfISO: string): number {
  if (asOfISO < startISO) return 0;
  // Counting whole months to the day *after* asOf makes a month complete on
  // its last day rather than the morning after.
  const end = format(addDays(parseISO(asOfISO), 1), "yyyy-MM-dd");
  const [sy, sm, sd] = startISO.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const months = (ey - sy) * 12 + (em - sm) - (ed < sd ? 1 : 0);
  return Math.max(0, months);
}

/** Completed years of experience by `asOfISO`, or null without a start date. */
export function experienceYears(emp: Employment, asOfISO: string): number | null {
  if (!emp.startDate) return null;
  const months = emp.priorExperienceMonths + monthsWorked(emp.startDate, asOfISO);
  return Math.floor(months / 12);
}

/**
 * The yyyy-MM-dd a month-day falls on in `year`. 29 February becomes the
 * 28th in years without one, so an expiry never silently moves into March.
 */
export function monthDayIn(year: number, monthDay: string): string {
  const [m, d] = monthDay.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${year}-${String(m).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "30 June" for "06-30". */
export function monthDayLabel(monthDay: string): string {
  const [m, d] = monthDay.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** How someone's annual allowance for one year is made up. */
export type AnnualBreakdown = {
  /** The template's yearly days. */
  base: number;
  /** Extra days for experience. 0 when the rule is off or no step is reached. */
  seniorityDays: number;
  /** Years of experience completed by 31 December, or null without a start date. */
  experienceYears: number | null;
  /** Set when this is the year they joined and first-year leave applies. */
  firstYear: { months: number; perMonth: number } | null;
  /** This year's own days: base plus seniority, or what the first year has earned. */
  own: number;
  /** Unused days brought in from last year. */
  carriedIn: number;
  /** yyyy-MM-dd after which unused carried days lapse, if they do. */
  carryExpires: string | null;
  /** Carried days not yet taken. */
  carriedLeft: number;
  /** Of those, the ones that lapsed because the expiry date has passed. */
  carriedExpired: number;
  /** Own days not yet taken or booked. */
  remainingOwn: number;
};

export type YearBalance = {
  type: string;
  name: string;
  /** Everything available this year: own days plus any carried in. */
  allowance: number;
  used: number;
  pending: number;
  /** allowance − used − pending, less carried days that have lapsed. */
  remaining: number;
  /** Only for annual leave. */
  annual: AnnualBreakdown | null;
};

type Usage = { used: number; pending: number; rows: LeaveRow[] };

/**
 * Approved and pending days of one type starting in `year`. Pending leave
 * holds its days like approved leave does, but only while it can still be
 * decided: a request left pending in a year that has ended no longer holds
 * anything back from the carry-over.
 */
function usageIn(
  rows: LeaveRow[],
  type: string,
  year: number,
  todayISO: string,
  excludeId?: string
): Usage {
  const countPending = year >= yearOf(todayISO);
  let used = 0;
  let pending = 0;
  const counted: LeaveRow[] = [];
  for (const r of rows) {
    if (r.type !== type || yearOf(r.start_date) !== year) continue;
    if (excludeId && r.id === excludeId) continue;
    if (r.status === "approved") used += Number(r.days_count);
    else if (r.status === "pending" && countPending) pending += Number(r.days_count);
    else continue;
    counted.push(r);
  }
  return { used: round1(used), pending: round1(pending), rows: counted };
}

/** The first year whose leftover days may carry into the next one. */
function firstCarryYear(emp: Employment): number {
  return Math.max(FIRST_TRACKED_YEAR, yearOf(emp.startDate ?? emp.joinedOn));
}

/**
 * This year's own annual days, before carry-over.
 *
 * Seniority counts the years completed by 31 December, so the year someone
 * reaches a step already has the extra day. In the year they start,
 * first-year leave (when on) replaces both the full allowance and seniority:
 * they earn the monthly amount as each month is worked, up to the full base.
 */
function ownAnnualDays(
  policy: LeavePolicy,
  emp: Employment,
  year: number,
  todayISO: string
): Pick<AnnualBreakdown, "base" | "seniorityDays" | "experienceYears" | "firstYear" | "own"> {
  const rule = ruleFor(policy, "annual");
  const base = Number(rule?.days ?? 0);
  const yearEnd = `${year}-12-31`;
  const exp = experienceYears(emp, yearEnd);

  if (emp.startDate && emp.startDate > yearEnd) {
    // Not started yet that year.
    return { base, seniorityDays: 0, experienceYears: exp, firstYear: null, own: 0 };
  }

  if (policy.firstYear.enabled && emp.startDate && yearOf(emp.startDate) === year) {
    const cutoff = todayISO < yearEnd ? todayISO : yearEnd;
    const months = monthsWorked(emp.startDate, cutoff);
    const perMonth = policy.firstYear.daysPerMonth;
    return {
      base,
      seniorityDays: 0,
      experienceYears: exp,
      firstYear: { months, perMonth },
      own: Math.min(base, round1(months * perMonth)),
    };
  }

  const seniorityDays =
    policy.seniority.enabled && exp !== null && policy.seniority.everyYears > 0
      ? round1(Math.floor(exp / policy.seniority.everyYears) * policy.seniority.extraDays)
      : 0;
  return { base, seniorityDays, experienceYears: exp, firstYear: null, own: round1(base + seniorityDays) };
}

/**
 * Annual leave for one year, carry-over included.
 *
 * Carried days are spent first on the earliest leave, since they are the days
 * that can lapse: leave starting on or before the expiry date draws on them,
 * anything later draws on this year's own days. Whatever is carried and
 * still unused after the expiry date lapses. Without an expiry, carried days
 * simply join this year's pool, and what's left of the pool can carry again.
 */
export function annualYear(
  policy: LeavePolicy,
  emp: Employment,
  rows: LeaveRow[],
  year: number,
  todayISO: string,
  excludeId?: string
): AnnualBreakdown & { used: number; pending: number; leftover: number } {
  const own = ownAnnualDays(policy, emp, year, todayISO);
  const carriedIn = carryInto(policy, emp, rows, year, todayISO, excludeId);
  const carryExpires =
    carriedIn > 0 && policy.carryOver.expires ? monthDayIn(year, policy.carryOver.expires) : null;

  const { used, pending, rows: counted } = usageIn(rows, "annual", year, todayISO, excludeId);
  const taken = used + pending;
  const beforeExpiry = carryExpires
    ? counted.filter((r) => r.start_date <= carryExpires).reduce((n, r) => n + Number(r.days_count), 0)
    : taken;

  const carriedUsed = Math.min(carriedIn, beforeExpiry);
  const remainingOwn = round1(own.own - (taken - carriedUsed));
  const carriedLeft = round1(carriedIn - carriedUsed);
  const carriedExpired = carryExpires && todayISO > carryExpires ? carriedLeft : 0;

  return {
    ...own,
    carriedIn,
    carryExpires,
    carriedLeft,
    carriedExpired,
    remainingOwn,
    used,
    pending,
    // Days that may carry into next year, before the cap. Carried days with
    // an expiry never carry twice.
    leftover: round1(carryExpires ? remainingOwn : remainingOwn + carriedLeft),
  };
}

function carryInto(
  policy: LeavePolicy,
  emp: Employment,
  rows: LeaveRow[],
  year: number,
  todayISO: string,
  excludeId?: string
): number {
  if (!policy.carryOver.enabled || year - 1 < firstCarryYear(emp)) return 0;
  const previous = annualYear(policy, emp, rows, year - 1, todayISO, excludeId);
  return round1(Math.min(policy.carryOver.maxDays, Math.max(0, previous.leftover)));
}

/** Balances for every enabled yearly type, in display order. */
export function yearBalances(
  policy: LeavePolicy,
  emp: Employment,
  rows: LeaveRow[],
  year: number,
  todayISO: string
): YearBalance[] {
  return policy.rules
    .filter((r) => r.enabled && r.limit === "per_year")
    .map((rule) => {
      if (rule.type === "annual") {
        const a = annualYear(policy, emp, rows, year, todayISO);
        const allowance = round1(a.own + a.carriedIn);
        return {
          type: rule.type,
          name: rule.name,
          allowance,
          used: a.used,
          pending: a.pending,
          remaining: round1(a.remainingOwn + a.carriedLeft - a.carriedExpired),
          annual: a,
        };
      }
      const { used, pending } = usageIn(rows, rule.type, year, todayISO);
      const allowance = Number(rule.days ?? 0);
      return {
        type: rule.type,
        name: rule.name,
        allowance,
        used,
        pending,
        remaining: round1(allowance - used - pending),
        annual: null,
      };
    });
}

/** Approved and pending days of one type starting in `year`, and how many requests they came in. */
export function takenIn(
  rows: LeaveRow[],
  type: string,
  year: number,
  todayISO: string,
  excludeId?: string
): { used: number; pending: number; requests: number } {
  const { used, pending, rows: counted } = usageIn(rows, type, year, todayISO, excludeId);
  return { used, pending, requests: counted.length };
}

/** One leave type the way an overview lists it: its rule, and what's been taken this year. */
export type TypeOverview = {
  type: string;
  name: string;
  limit: LimitKind;
  unit: DayUnit;
  note: string | null;
  /** The yearly allowance or the cap on each request; null when unlimited. */
  days: number | null;
  /** Approved days starting in the year. */
  used: number;
  /** Pending days starting in the year. */
  pending: number;
  /** Approved and pending requests of this type starting in the year. */
  requests: number;
  /** For yearly types: allowance, days left and, for annual leave, how it's made up. */
  balance: YearBalance | null;
  /** Switched off on the template since, but taken this year. */
  retired: boolean;
};

/**
 * Every leave type on someone's template, in display order, with what they've
 * taken of each in `year`. Each type keeps its own count: paternity leave
 * never comes out of annual leave, and vice versa. A type since switched off
 * still appears if it was taken that year, so the year adds up.
 */
export function leaveOverview(
  policy: LeavePolicy,
  emp: Employment,
  rows: LeaveRow[],
  year: number,
  todayISO: string
): TypeOverview[] {
  const balances = new Map(yearBalances(policy, emp, rows, year, todayISO).map((b) => [b.type, b]));
  const out: TypeOverview[] = [];
  for (const rule of policy.rules) {
    const { used, pending, requests } = takenIn(rows, rule.type, year, todayISO);
    if (!rule.enabled && used + pending === 0) continue;
    out.push({
      type: rule.type,
      name: rule.name,
      limit: rule.limit,
      unit: rule.unit,
      note: rule.note,
      days: rule.days,
      used,
      pending,
      requests,
      balance: balances.get(rule.type) ?? null,
      retired: !rule.enabled,
    });
  }
  return out;
}

/**
 * The most days a new request of `type` starting on `startISO` may take, or
 * null when nothing caps it. `excludeId` leaves out the request being edited,
 * so its current days don't count against its new shape.
 */
export function availableDays(
  policy: LeavePolicy,
  emp: Employment,
  rows: LeaveRow[],
  type: string,
  startISO: string,
  todayISO: string,
  excludeId?: string
): number | null {
  const rule = ruleFor(policy, type);
  if (!rule || rule.limit === "unlimited") return null;
  if (rule.limit === "per_request") return Number(rule.days ?? 0);

  const year = yearOf(startISO);
  if (type === "annual") {
    const a = annualYear(policy, emp, rows, year, todayISO, excludeId);
    const carried = !a.carryExpires || startISO <= a.carryExpires ? a.carriedLeft : 0;
    return round1(a.remainingOwn + carried);
  }
  const { used, pending } = usageIn(rows, type, year, todayISO, excludeId);
  return round1(Number(rule.days ?? 0) - used - pending);
}

/** "annual leave", "TOIL": a type's name as it reads mid-sentence. */
export function leavePhrase(name: string): string {
  const second = name.charAt(1);
  return second && second === second.toLowerCase() ? name.charAt(0).toLowerCase() + name.slice(1) : name;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Why a request can't be that long, in the words the form and the API both
 * use. `available` comes from {@link availableDays}.
 */
export function limitMessage(
  rule: Pick<LeaveTypeRule, "name" | "limit" | "unit">,
  available: number,
  days: number,
  startISO: string,
  who: "you" | "they" = "you"
): string {
  const unit = rule.unit === "calendar" ? "calendar day" : "working day";
  if (rule.limit === "per_request") {
    return `${rule.name} is limited to ${plural(available, unit)} per occasion. This request is ${plural(days, "day")}.`;
  }
  const year = startISO.slice(0, 4);
  const subject = who === "you" ? "You have" : "They have";
  const phrase = leavePhrase(rule.name);
  return available <= 0
    ? `${subject} no ${phrase} days left in ${year}.`
    : `${subject} ${plural(available, `${phrase} day`)} left in ${year}. This request is ${plural(days, "day")}.`;
}

/** One line describing a rule's limit, for forms and admin summaries. */
export function describeLimit(rule: Pick<LeaveTypeRule, "limit" | "days" | "unit">): string {
  const n = Number(rule.days ?? 0);
  const unit = rule.unit === "calendar" ? "calendar day" : "working day";
  const days = `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (rule.limit === "per_year") return `${days} a year`;
  if (rule.limit === "per_request") return `Up to ${days} per occasion`;
  return "No fixed limit";
}
