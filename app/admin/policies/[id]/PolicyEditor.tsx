"use client";

import { useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Dialog from "@/components/Dialog";
import Field from "@/components/Field";
import Select, { type SelectOption } from "@/components/Select";
import {
  DEFAULT_WEEKLY_HOURS,
  describeLimit,
  monthDayLabel,
  PAY_PERIODS_PER_YEAR,
  type AccrualMethod,
  type DayUnit,
  type LeavePolicy,
  type LimitKind,
  type PayFrequency,
} from "@/lib/leave-rules";

type TypeRow = {
  /** A catalogue key, or "new:<n>" until the first save gives it one. */
  key: string;
  name: string;
  isNew: boolean;
  /** Booked at least once, so it can be switched off but not deleted. */
  used: boolean;
  enabled: boolean;
  limit: LimitKind;
  days: string;
  unit: DayUnit;
  note: string;
};

const LIMIT_OPTIONS: SelectOption<LimitKind>[] = [
  { value: "per_year", label: "Days per year", description: "An allowance that resets every 1 January" },
  { value: "per_request", label: "Days per occasion", description: "A cap on each request, with no yearly total" },
  { value: "unlimited", label: "No fixed limit", description: "Whoever approves it decides" },
];

const UNIT_OPTIONS: SelectOption<DayUnit>[] = [
  { value: "working", label: "Working days", description: "Weekends and public holidays don't count" },
  { value: "calendar", label: "Calendar days", description: "Every day in the range counts" },
];

const ACCRUAL_OPTIONS: SelectOption<AccrualMethod>[] = [
  { value: "hours", label: "Hours worked", description: "Days for every so many hours someone works" },
  { value: "pay_period", label: "Pay periods completed", description: "Days for each pay period, like a payslip" },
  { value: "service", label: "Years of service", description: "A yearly rate that grows with experience, earned monthly" },
];

const FREQUENCY_OPTIONS: SelectOption<PayFrequency>[] = [
  { value: "weekly", label: "Weekly", description: "52 pay periods a year" },
  { value: "biweekly", label: "Every two weeks", description: "26 pay periods a year" },
  { value: "semimonthly", label: "Twice a month", description: "24 pay periods a year, ending on the 15th and month end" },
  { value: "monthly", label: "Monthly", description: "12 pay periods a year" },
];

type TierRow = { id: number; fromYears: string; daysPerYear: string };

// Carried days lapse at the end of a month, or never.
const EXPIRY_OPTIONS = ["01-31", "02-28", "03-31", "04-30", "05-31", "06-30", "07-31", "08-31", "09-30", "10-31", "11-30"];

/** What a save sends: the template's settings and one rule per leave type. */
export type PolicyPayload = {
  name: string;
  seniority: LeavePolicy["seniority"];
  firstYear: LeavePolicy["firstYear"];
  carryOver: LeavePolicy["carryOver"];
  /** Left out by sign-up, which doesn't offer accrual: the template keeps what it has. */
  accrual?: LeavePolicy["accrual"];
  rules: { type: string; enabled: boolean; limit: LimitKind; days: number | null; unit: DayUnit; note: string | null }[];
};

/**
 * Sign-up uses this editor before the company exists (app/signup). Nothing
 * is saved from here: the finished template goes to `onSubmit`, and the
 * catalogue can't change, so adding and deleting types is hidden.
 */
export type DraftMode = {
  onSubmit: (payload: PolicyPayload) => void;
  /** Leaving the editor; gets what's on screen, unchecked, so coming back restores it. */
  onBack: (payload: PolicyPayload) => void;
  busy: boolean;
  submitLabel: string;
  /** From sign-up, e.g. the server turning the request down. */
  error?: string | null;
  /** The country's legal minimum, flagged under annual leave when the allowance is lower. */
  annualMinimum?: number | null;
};

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
const halfStep = (n: number) => Number.isFinite(n) && Math.round(n * 2) === n * 2;

export default function PolicyEditor({
  policy,
  usedTypes,
  draft,
}: {
  policy: LeavePolicy;
  usedTypes: string[];
  draft?: DraftMode;
}) {
  const router = useRouter();
  const annualRule = policy.rules.find((r) => r.type === "annual");

  const [name, setName] = useState(policy.name);
  const [annualDays, setAnnualDays] = useState(String(annualRule?.days ?? 20));
  const [seniority, setSeniority] = useState({
    enabled: policy.seniority.enabled,
    everyYears: String(policy.seniority.everyYears),
    extraDays: String(policy.seniority.extraDays),
  });
  const [firstYear, setFirstYear] = useState({
    enabled: policy.firstYear.enabled,
    daysPerMonth: String(policy.firstYear.daysPerMonth),
  });
  const [carry, setCarry] = useState({
    enabled: policy.carryOver.enabled,
    maxDays: String(policy.carryOver.maxDays),
    expires: policy.carryOver.expires ?? "",
  });
  const [accrual, setAccrual] = useState(() => ({
    enabled: policy.accrual.method !== null,
    method: policy.accrual.method ?? ("hours" as AccrualMethod),
    hoursDays: String(policy.accrual.hours.days),
    perHours: String(policy.accrual.hours.perHours),
    frequency: policy.accrual.payPeriod.frequency,
    periodDays: String(policy.accrual.payPeriod.days),
  }));
  // The years-of-service scale. A new one starts from today's yearly days.
  const [tiers, setTiers] = useState<TierRow[]>(() =>
    (policy.accrual.service.length
      ? [...policy.accrual.service].sort((a, b) => a.fromYears - b.fromYears)
      : [{ fromYears: 0, daysPerYear: Number(annualRule?.days ?? 20) }]
    ).map((t, i) => ({ id: i, fromYears: String(t.fromYears), daysPerYear: String(t.daysPerYear) }))
  );
  const [rows, setRows] = useState<TypeRow[]>(() =>
    policy.rules
      .filter((r) => r.type !== "annual")
      .map((r) => ({
        key: r.type,
        name: r.name,
        isNew: false,
        used: usedTypes.includes(r.type),
        enabled: r.enabled,
        limit: r.limit,
        days: r.days === null ? "" : String(r.days),
        unit: r.unit,
        note: r.note ?? "",
      }))
  );
  const [deleted, setDeleted] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [nextRef, setNextRef] = useState(1);
  const [confirming, setConfirming] = useState<TypeRow | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // What the chosen rate adds up to over a whole year, so admins can sanity-check it.
  const annualNumber = num(annualDays);
  const yearlyEstimate =
    accrual.method === "hours"
      ? (num(accrual.hoursDays) * DEFAULT_WEEKLY_HOURS * 52) / num(accrual.perHours)
      : accrual.method === "pay_period"
        ? num(accrual.periodDays) * PAY_PERIODS_PER_YEAR[accrual.frequency]
        : NaN;
  const capped = accrual.method !== "service";
  // Hours-based rates read more naturally in working days: 1 day per 104 hours is every 13 days at 8 hours a day.
  const workingDaysPerDay =
    Math.round((num(accrual.perHours) / (DEFAULT_WEEKLY_HOURS / 5) / num(accrual.hoursDays)) * 10) / 10;
  // How long a whole day takes to earn in everyday time, for either rate.
  const weeksPerDay =
    accrual.method === "hours"
      ? workingDaysPerDay / 5
      : accrual.method === "pay_period"
        ? 52 / PAY_PERIODS_PER_YEAR[accrual.frequency] / num(accrual.periodDays)
        : NaN;

  const expiryOptions =
    carry.expires && !EXPIRY_OPTIONS.includes(carry.expires) ? [...EXPIRY_OPTIONS, carry.expires].sort() : EXPIRY_OPTIONS;

  function updateRow(key: string, patch: Partial<TypeRow>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addType() {
    const typeName = newName.trim();
    if (!typeName) return;
    const taken = [annualRule?.name ?? "Annual leave", ...rows.map((r) => r.name)].map((n) => n.toLowerCase());
    if (taken.includes(typeName.toLowerCase())) {
      setErrors((e) => ({ ...e, newType: `There's already a leave type called "${typeName}".` }));
      return;
    }
    setRows((current) => [
      ...current,
      { key: `new:${nextRef}`, name: typeName, isNew: true, used: false, enabled: true, limit: "per_request", days: "1", unit: "working", note: "" },
    ]);
    setNextRef((n) => n + 1);
    setNewName("");
    setErrors((e) => {
      const next = { ...e };
      delete next.newType;
      return next;
    });
  }

  function removeType(row: TypeRow) {
    setRows((current) => current.filter((r) => r.key !== row.key));
    if (!row.isNew) setDeleted((keys) => [...keys, row.key]);
    setConfirming(null);
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Give the template a name.";
    const annual = num(annualDays);
    if (!halfStep(annual) || annual < 0 || annual > 366) e.annualDays = "Use 0 to 366, in steps of half a day.";
    if (seniority.enabled) {
      const every = num(seniority.everyYears);
      const extra = num(seniority.extraDays);
      if (!Number.isInteger(every) || every < 1 || every > 50) e.everyYears = "Whole years, 1 to 50.";
      if (!halfStep(extra) || extra <= 0 || extra > 30) e.extraDays = "More than 0, up to 30, in half days.";
    }
    if (firstYear.enabled) {
      const perMonth = num(firstYear.daysPerMonth);
      if (!Number.isFinite(perMonth) || perMonth <= 0 || perMonth > 31) e.daysPerMonth = "More than 0, up to 31.";
    }
    if (accrual.enabled && accrual.method === "hours") {
      const d = num(accrual.hoursDays);
      const h = num(accrual.perHours);
      if (!Number.isFinite(d) || d <= 0 || d > 31) e.hoursDays = "More than 0, up to 31.";
      if (!Number.isFinite(h) || h < 1 || h > 2080) e.perHours = "1 to 2,080 hours.";
    }
    if (accrual.enabled && accrual.method === "pay_period") {
      const d = num(accrual.periodDays);
      if (!Number.isFinite(d) || d <= 0 || d > 31) e.periodDays = "More than 0, up to 31.";
    }
    if (accrual.enabled && accrual.method === "service") {
      const seen = new Set<number>();
      for (const t of tiers) {
        const y = num(t.fromYears);
        const d = num(t.daysPerYear);
        if (!Number.isInteger(y) || y < 0 || y > 60 || seen.has(y)) e[`tierYears:${t.id}`] = "Whole years, 0 to 60, each different.";
        if (!halfStep(d) || d < 0 || d > 366) e[`tierDays:${t.id}`] = "0 to 366, in half days.";
        seen.add(y);
      }
      if (!seen.has(0)) e.tiers = "Start the scale at 0 years, so new joiners earn too.";
    }
    if (carry.enabled) {
      const max = num(carry.maxDays);
      if (!halfStep(max) || max <= 0 || max > 366) e.maxDays = "More than 0, up to 366, in half days.";
    }
    for (const r of rows) {
      if (!r.enabled || r.limit === "unlimited") continue;
      const d = num(r.days);
      const min = r.limit === "per_request" ? 0.5 : 0;
      if (!halfStep(d) || d < min || d > 1000) {
        e[`days:${r.key}`] = r.limit === "per_request" ? "At least half a day, in half days." : "0 or more, in half days.";
      }
    }
    return e;
  }

  // A switched-off setting can't be corrected on screen, so an invalid value
  // there falls back to what was saved rather than blocking the save.
  const orSaved = (value: string, saved: number) => (Number.isFinite(num(value)) && num(value) > 0 ? num(value) : saved);

  function buildPayload() {
    return {
      name: name.trim(),
      seniority: {
        enabled: seniority.enabled,
        everyYears: Math.round(orSaved(seniority.everyYears, policy.seniority.everyYears)),
        extraDays: orSaved(seniority.extraDays, policy.seniority.extraDays),
      },
      firstYear: {
        enabled: firstYear.enabled,
        daysPerMonth: orSaved(firstYear.daysPerMonth, policy.firstYear.daysPerMonth),
      },
      carryOver: {
        enabled: carry.enabled,
        maxDays: orSaved(carry.maxDays, policy.carryOver.maxDays),
        expires: carry.expires || null,
      },
      accrual: {
        method: accrual.enabled ? accrual.method : null,
        hours: {
          days: orSaved(accrual.hoursDays, policy.accrual.hours.days),
          perHours: orSaved(accrual.perHours, policy.accrual.hours.perHours),
        },
        payPeriod: { frequency: accrual.frequency, days: orSaved(accrual.periodDays, policy.accrual.payPeriod.days) },
        service:
          accrual.enabled && accrual.method === "service"
            ? tiers.map((t) => ({ fromYears: num(t.fromYears), daysPerYear: num(t.daysPerYear) }))
            : policy.accrual.service,
      },
      rules: [
        { type: "annual", enabled: true, limit: "per_year", days: num(annualDays), unit: "working", note: annualRule?.note ?? null },
        ...rows.map((r) => {
          const saved = policy.rules.find((p) => p.type === r.key);
          const days = r.limit === "unlimited" ? null : halfStep(num(r.days)) && num(r.days) >= 0 ? num(r.days) : saved?.days ?? 1;
          return { type: r.key, enabled: r.enabled, limit: r.limit, days, unit: r.unit, note: r.note.trim() || null };
        }),
      ],
      newTypes: rows.filter((r) => r.isNew).map((r) => ({ ref: r.key, name: r.name })),
      deleteTypes: deleted,
    };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      setMsg({ kind: "err", text: "Some values need fixing first. They're marked above." });
      return;
    }

    const payload = buildPayload();
    if (draft) {
      setMsg(null);
      const { name, seniority, firstYear, carryOver, rules } = payload;
      draft.onSubmit({ name, seniority, firstYear, carryOver, rules: rules as PolicyPayload["rules"] });
      return;
    }

    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/leave-policies/${policy.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: "err", text: json.error || "Couldn't save. Try again." });
      return;
    }
    // New types now have real keys; keep editing them under those.
    const keys: Record<string, string> = json.keys ?? {};
    setRows((current) => current.map((r) => (r.isNew && keys[r.key] ? { ...r, key: keys[r.key], isNew: false } : r)));
    setDeleted([]);
    setMsg({ kind: "ok", text: "Saved. Balances and request forms use the new rules straight away." });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      <section className="card p-4 sm:p-6">
        <div className="max-w-md">
          <Field label="Template name" error={errors.name}>
            {(p) => (
              <input {...p} className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            )}
          </Field>
        </div>
      </section>

      <section className="card p-4 sm:p-6">
        <h2 className="text-base font-semibold text-neutral-900 tracking-tight">Annual leave</h2>
        <p className="mt-1 text-sm text-neutral-500">
          The yearly allowance, and the rules that give people on this template more days, or fewer in their first year.
        </p>

        <div className="mt-5 max-w-xs">
          <Field
            label={accrual.enabled && capped ? "Most days earned a year" : "Days a year"}
            hint={
              accrual.enabled && accrual.method === "service"
                ? "Not used while leave is earned by years of service: the scale below sets the days."
                : accrual.enabled
                  ? "Working days. Earning stops here for the year (plus any seniority days)."
                  : "Working days. Weekends and public holidays don't count."
            }
            error={
              errors.annualDays ??
              (draft?.annualMinimum != null && num(annualDays) < draft.annualMinimum
                ? `Below the legal minimum of ${draft.annualMinimum}.`
                : null)
            }
          >
            {(p) => (
              <input
                {...p}
                type="number"
                inputMode="decimal"
                step={0.5}
                min={0}
                className="input"
                value={annualDays}
                onChange={(e) => setAnnualDays(e.target.value)}
              />
            )}
          </Field>
        </div>

        <Toggle
          label="Seniority bonus"
          description="Extra days for years of work experience, including experience from before the company. It uses each person's start date and previous experience, set under Employees."
          checked={seniority.enabled}
          onChange={(enabled) => setSeniority((s) => ({ ...s, enabled }))}
        >
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <Field label="Extra days" error={errors.extraDays}>
              {(p) => (
                <input
                  {...p}
                  type="number"
                  inputMode="decimal"
                  step={0.5}
                  min={0.5}
                  className="input"
                  value={seniority.extraDays}
                  onChange={(e) => setSeniority((s) => ({ ...s, extraDays: e.target.value }))}
                />
              )}
            </Field>
            <Field label="For every (years)" error={errors.everyYears}>
              {(p) => (
                <input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={1}
                  className="input"
                  value={seniority.everyYears}
                  onChange={(e) => setSeniority((s) => ({ ...s, everyYears: e.target.value }))}
                />
              )}
            </Field>
          </div>
          <p className="text-xs text-neutral-500">
            Years completed by 31 December count for that whole year, so the year someone reaches a step already has the
            extra days.
          </p>
        </Toggle>

        {!draft && (
          <Toggle
            label="Earn leave gradually"
            description="Instead of the whole year's days on 1 January, people earn them as they go: by hours worked, pay periods completed, or at a rate that grows with years of service. They can book what they've earned so far."
            checked={accrual.enabled}
            onChange={(enabled) => setAccrual((s) => ({ ...s, enabled }))}
          >
            <div className="max-w-md">
              <Field label="Earned by">
                {(p) => (
                  <Select
                    {...p}
                    value={accrual.method}
                    onChange={(method) => setAccrual((s) => ({ ...s, method }))}
                    options={ACCRUAL_OPTIONS}
                  />
                )}
              </Field>
            </div>

            {accrual.method === "hours" && (
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <Field label="Days earned" error={errors.hoursDays}>
                  {(p) => (
                    <input
                      {...p}
                      type="number"
                      inputMode="decimal"
                      step={0.01}
                      min={0.01}
                      className="input"
                      value={accrual.hoursDays}
                      onChange={(e) => setAccrual((s) => ({ ...s, hoursDays: e.target.value }))}
                    />
                  )}
                </Field>
                <Field label="For every (hours worked)" error={errors.perHours}>
                  {(p) => (
                    <input
                      {...p}
                      type="number"
                      inputMode="decimal"
                      step={1}
                      min={1}
                      className="input"
                      value={accrual.perHours}
                      onChange={(e) => setAccrual((s) => ({ ...s, perHours: e.target.value }))}
                    />
                  )}
                </Field>
              </div>
            )}

            {accrual.method === "pay_period" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                <Field label="Pay periods">
                  {(p) => (
                    <Select
                      {...p}
                      value={accrual.frequency}
                      onChange={(frequency) => setAccrual((s) => ({ ...s, frequency }))}
                      options={FREQUENCY_OPTIONS}
                    />
                  )}
                </Field>
                <Field label="Days per pay period" error={errors.periodDays}>
                  {(p) => (
                    <input
                      {...p}
                      type="number"
                      inputMode="decimal"
                      step={0.01}
                      min={0.01}
                      className="input"
                      value={accrual.periodDays}
                      onChange={(e) => setAccrual((s) => ({ ...s, periodDays: e.target.value }))}
                    />
                  )}
                </Field>
              </div>
            )}

            {capped && (
              <p className="text-xs text-neutral-500">
                {Number.isFinite(yearlyEstimate) && yearlyEstimate > 0
                  ? `That's 1 day ${everyLabel(weeksPerDay)}${
                      accrual.method === "hours"
                        ? ` (every ${workingDaysPerDay} working days at ${DEFAULT_WEEKLY_HOURS} hours a week)`
                        : ""
                    }, so about ${Math.round(yearlyEstimate * 10) / 10} days over a full year, never more than ${Number.isFinite(annualNumber) ? annualNumber : "the days a year"} plus seniority. `
                  : ""}
                {Number.isFinite(annualNumber) && annualNumber > 0 && (
                  <button
                    type="button"
                    className="font-medium text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900"
                    onClick={() =>
                      setAccrual((s) =>
                        s.method === "hours"
                          ? {
                              ...s,
                              hoursDays: "1",
                              perHours: String(Math.round((DEFAULT_WEEKLY_HOURS * 52) / annualNumber)),
                            }
                          : {
                              ...s,
                              periodDays: String(Math.round((annualNumber / PAY_PERIODS_PER_YEAR[s.frequency]) * 100) / 100),
                            }
                      )
                    }
                  >
                    Spread {annualNumber} days evenly over the year
                  </button>
                )}
                {accrual.method === "hours" && (
                  <span className="block mt-1">
                    Hours are each person&apos;s hours a week (set under Employees, {DEFAULT_WEEKLY_HOURS} if not), worked Monday
                    to Friday. Approved unpaid leave earns nothing.
                  </span>
                )}
              </p>
            )}

            {accrual.method === "service" && (
              <div className="max-w-md">
                <ul className="space-y-2">
                  {tiers.map((t) => (
                    <li key={t.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                      <Field label="From (years)" error={errors[`tierYears:${t.id}`]}>
                        {(p) => (
                          <input
                            {...p}
                            type="number"
                            inputMode="numeric"
                            step={1}
                            min={0}
                            className="input"
                            value={t.fromYears}
                            onChange={(e) =>
                              setTiers((all) => all.map((x) => (x.id === t.id ? { ...x, fromYears: e.target.value } : x)))
                            }
                          />
                        )}
                      </Field>
                      <Field label="Days a year" error={errors[`tierDays:${t.id}`]}>
                        {(p) => (
                          <input
                            {...p}
                            type="number"
                            inputMode="decimal"
                            step={0.5}
                            min={0}
                            className="input"
                            value={t.daysPerYear}
                            onChange={(e) =>
                              setTiers((all) => all.map((x) => (x.id === t.id ? { ...x, daysPerYear: e.target.value } : x)))
                            }
                          />
                        )}
                      </Field>
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-rose-600 transition hover:text-rose-700 disabled:invisible"
                        disabled={tiers.length === 1}
                        onClick={() => setTiers((all) => all.filter((x) => x.id !== t.id))}
                        aria-label={`Remove the step from ${t.fromYears} years`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                {errors.tiers && <p className="mt-2 text-xs text-rose-700">{errors.tiers}</p>}
                <button
                  type="button"
                  className="btn-secondary mt-3"
                  disabled={tiers.length >= 20}
                  onClick={() =>
                    setTiers((all) => {
                      const last = all[all.length - 1];
                      const id = Math.max(...all.map((x) => x.id)) + 1;
                      return [
                        ...all,
                        {
                          id,
                          fromYears: String((num(last?.fromYears ?? "0") || 0) + 5),
                          daysPerYear: String((num(last?.daysPerYear ?? "20") || 20) + 1),
                        },
                      ];
                    })
                  }
                >
                  Add a step
                </button>
                <p className="mt-2 text-xs text-neutral-500">
                  Each month worked earns a twelfth of the year&apos;s days. Years of service count previous experience, like
                  seniority, and the seniority bonus doesn&apos;t add to this scale.
                </p>
              </div>
            )}

            <p className="text-xs text-neutral-500">
              Earning starts on 1 January, or on someone&apos;s start date in the year they join, so it replaces first-year
              leave. Carry-over still works on whatever is left at the end of the year.
            </p>
          </Toggle>
        )}

        <Toggle
          label="First-year leave"
          description={
            accrual.enabled
              ? "Not used while leave is earned gradually: earning already starts on each person's start date."
              : "In the year someone joins, they earn days for each month worked instead of getting the full allowance. From the next 1 January they get the full amount."
          }
          checked={firstYear.enabled}
          onChange={(enabled) => setFirstYear((s) => ({ ...s, enabled }))}
        >
          <div className="max-w-xs">
            <Field label="Days per month worked" error={errors.daysPerMonth}>
              {(p) => (
                <input
                  {...p}
                  type="number"
                  inputMode="decimal"
                  step={0.01}
                  min={0.01}
                  className="input"
                  value={firstYear.daysPerMonth}
                  onChange={(e) => setFirstYear((s) => ({ ...s, daysPerMonth: e.target.value }))}
                />
              )}
            </Field>
          </div>
          <p className="text-xs text-neutral-500">
            A month counts once it has been worked in full, and the total never goes above the yearly allowance. It needs a
            start date, set under Employees.
          </p>
        </Toggle>

        <Toggle
          label="Carry over unused days"
          description="Leftover annual days move into the next year. Carried days are used before that year's own days."
          checked={carry.enabled}
          onChange={(enabled) => setCarry((s) => ({ ...s, enabled }))}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
            <Field label="Up to (days)" error={errors.maxDays}>
              {(p) => (
                <input
                  {...p}
                  type="number"
                  inputMode="decimal"
                  step={0.5}
                  min={0.5}
                  className="input"
                  value={carry.maxDays}
                  onChange={(e) => setCarry((s) => ({ ...s, maxDays: e.target.value }))}
                />
              )}
            </Field>
            <Field label="Use carried days by">
              {(p) => (
                <Select
                  {...p}
                  value={carry.expires}
                  onChange={(expires) => setCarry((s) => ({ ...s, expires }))}
                  options={[
                    { value: "", label: "The end of that year", description: "Carried days last all year" },
                    ...expiryOptions.map((md) => ({ value: md, label: monthDayLabel(md) })),
                  ]}
                />
              )}
            </Field>
          </div>
          <p className="text-xs text-neutral-500">
            {carry.expires
              ? `Carried days not used by ${monthDayLabel(carry.expires)} are lost.`
              : "Carried days last all year, and whatever is still unused can carry over again, up to the same limit."}{" "}
            The first days to carry over are this year&apos;s leftovers.
          </p>
        </Toggle>
      </section>

      <section className="card p-4 sm:p-6">
        <h2 className="text-base font-semibold text-neutral-900 tracking-tight">Other leave types</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Switch on what people on this template can request. Each type has a yearly allowance, a limit per occasion, or no
          fixed limit.
        </p>

        <ul className="mt-5 divide-y divide-neutral-100 border-y border-neutral-100">
          {rows.map((row) => (
            <TypeRowEditor
              key={row.key}
              row={row}
              error={errors[`days:${row.key}`]}
              onChange={(patch) => updateRow(row.key, patch)}
              onRemove={
                draft || row.key === "sick" || row.used
                  ? undefined
                  : () => (row.isNew ? removeType(row) : setConfirming(row))
              }
            />
          ))}
        </ul>

        {draft ? (
          <p className="mt-4 text-xs text-neutral-500">
            Need a type that isn&apos;t here? Add your own under Leave policies once your company is set up.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex-1">
              <Field
                label="Add a leave type"
                hint="It joins every template, switched off everywhere except here."
                error={errors.newType}
              >
                {(p) => (
                  <input
                    {...p}
                    className="input"
                    maxLength={60}
                    placeholder="e.g. Parent's leave"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter adds the type rather than saving the whole template.
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addType();
                      }
                    }}
                  />
                )}
              </Field>
            </div>
            <button type="button" className="btn-secondary sm:mt-[1.625rem]" onClick={addType} disabled={!newName.trim()}>
              Add type
            </button>
          </div>
        )}
      </section>

      {draft ? (
        <div className="space-y-3">
          <div aria-live="polite" className="text-sm">
            {(msg?.kind === "err" || draft.error) && <p className="text-rose-700">{msg?.text ?? draft.error}</p>}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              className="btn-secondary"
              disabled={draft.busy}
              onClick={() => {
                const { name, seniority, firstYear, carryOver, rules } = buildPayload();
                draft.onBack({ name, seniority, firstYear, carryOver, rules: rules as PolicyPayload["rules"] });
              }}
            >
              Back
            </button>
            <button className="btn-primary w-full sm:w-auto sm:min-w-48" disabled={draft.busy}>
              {draft.busy ? "Sending…" : draft.submitLabel}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite" className="text-sm">
            {msg && (
              <p className={msg.kind === "ok" ? "text-neutral-700" : "text-rose-700"}>
                {msg.kind === "ok" && (
                  <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full dot-accent align-middle" />
                )}
                {msg.text}
              </p>
            )}
            {!msg && deleted.length > 0 && (
              <p className="text-neutral-600">
                {deleted.length === 1 ? "1 leave type is" : `${deleted.length} leave types are`} deleted when you save.
              </p>
            )}
          </div>
          <button className="btn-primary w-full sm:w-auto" disabled={busy}>
            {busy ? "Saving…" : "Save template"}
          </button>
        </div>
      )}

      <Dialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title={confirming ? `Delete ${confirming.name}?` : "Delete leave type?"}
        description="It's removed from every template when you save, not just this one. Nobody has booked it yet, so no leave is affected."
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirming(null)}>
              Keep it
            </button>
            <button type="button" className="btn-danger" onClick={() => confirming && removeType(confirming)}>
              Delete type
            </button>
          </>
        }
      />
    </form>
  );
}

/** "about every 2½ weeks": a time to earn one day, in the unit that reads best. */
function everyLabel(weeks: number): string {
  if (!Number.isFinite(weeks) || weeks <= 0) return "";
  const half = (n: number) => {
    const whole = Math.floor(n);
    return n === whole ? String(whole) : whole === 0 ? "½" : `${whole}½`;
  };
  if (weeks < 0.9) {
    const days = Math.max(1, Math.round(weeks * 5));
    return days === 1 ? "every working day" : `about every ${days} working days`;
  }
  if (weeks < 7.75) {
    const w = Math.round(weeks * 2) / 2;
    return w === 1 ? "about every week" : `about every ${half(w)} weeks`;
  }
  const months = Math.round((weeks / (52 / 12)) * 2) / 2;
  return months === 1 ? "about every month" : `about every ${half(months)} months`;
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  children,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="mt-5 border-t border-neutral-100 pt-5">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-neutral-900"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={`${id}-description`}
        />
        <div>
          <label htmlFor={id} className="block text-sm font-medium text-neutral-900">
            {label}
          </label>
          <p id={`${id}-description`} className="mt-0.5 text-xs text-neutral-500">
            {description}
          </p>
        </div>
      </div>
      {checked && <div className="mt-3 space-y-2 pl-7">{children}</div>}
    </div>
  );
}

function TypeRowEditor({
  row,
  error,
  onChange,
  onRemove,
}: {
  row: TypeRow;
  error?: string;
  onChange: (patch: Partial<TypeRow>) => void;
  onRemove?: () => void;
}) {
  const id = useId();
  const days = num(row.days);
  const summary = row.enabled
    ? describeLimit({ limit: row.limit, days: Number.isFinite(days) ? days : 0, unit: row.unit })
    : "Off";

  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <input
            id={id}
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-neutral-900"
            checked={row.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            aria-describedby={`${id}-summary`}
          />
          <div className="min-w-0">
            <label htmlFor={id} className="block text-sm font-medium text-neutral-900">
              {row.name}
              {row.isNew && <span className="ml-2 text-xs font-normal text-neutral-500">New</span>}
            </label>
            <p id={`${id}-summary`} className="text-xs text-neutral-500">
              {summary}
            </p>
          </div>
        </div>
        {onRemove && (
          <button
            type="button"
            className="-my-3 inline-flex min-h-11 shrink-0 items-center px-2 text-xs font-medium text-rose-600 transition hover:text-rose-700"
            onClick={onRemove}
            aria-label={`Delete ${row.name}`}
          >
            {row.isNew ? "Remove" : "Delete"}
          </button>
        )}
      </div>

      {row.enabled && (
        <div className="mt-3 grid grid-cols-1 gap-3 pl-7 sm:grid-cols-3">
          <Field label="Limit">
            {(p) => (
              <Select {...p} value={row.limit} onChange={(limit) => onChange({ limit })} options={LIMIT_OPTIONS} />
            )}
          </Field>
          {row.limit !== "unlimited" && (
            <Field label={row.limit === "per_year" ? "Days a year" : "Days per occasion"} error={error}>
              {(p) => (
                <input
                  {...p}
                  type="number"
                  inputMode="decimal"
                  step={0.5}
                  min={0}
                  className="input"
                  value={row.days}
                  onChange={(e) => onChange({ days: e.target.value })}
                />
              )}
            </Field>
          )}
          <Field label="Counts">
            {(p) => (
              <Select {...p} value={row.unit} onChange={(unit) => onChange({ unit })} options={UNIT_OPTIONS} />
            )}
          </Field>
          <div className="sm:col-span-3">
            <Field label="Note for employees (optional)" hint="Shown when they pick this type, e.g. how it's paid or what to bring.">
              {(p) => (
                <textarea
                  {...p}
                  className="input"
                  rows={2}
                  maxLength={400}
                  value={row.note}
                  onChange={(e) => onChange({ note: e.target.value })}
                />
              )}
            </Field>
          </div>
        </div>
      )}
    </li>
  );
}
