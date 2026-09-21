"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { countDaysForUnit, HALF_DAY_OPTIONS, type HalfKind } from "@/lib/days";
import {
  availableDays,
  describeLimit,
  leavePhrase,
  limitMessage,
  requestableRules,
  ruleFor,
  takenIn,
  type Employment,
  type LeavePolicy,
  type LeaveRow,
} from "@/lib/leave-rules";
import DateRangePicker from "@/components/DateRangePicker";
import Field from "@/components/Field";
import Select from "@/components/Select";

export type EditTarget = {
  id: string;
  type: string;
  start: string;
  end: string;
  halfStart: HalfKind;
  halfEnd: HalfKind;
  reason: string;
  status: "pending" | "approved";
};

export default function RequestLeaveForm({
  holidays,
  policy,
  employment,
  rows,
  todayISO,
  blockedDates,
  calendarHref,
  edit,
}: {
  holidays: { date: string; name: string }[];
  // The requester's leave template, employment details and approved/pending
  // leave: enough to run the same limit check the server runs, for any dates.
  policy: LeavePolicy;
  employment: Employment;
  rows: LeaveRow[];
  todayISO: string;
  // ISO dates the user already has approved/pending leave on.
  blockedDates: string[];
  // Calendar page to land on after a successful submit.
  calendarHref: string;
  // When present, the form edits this existing request instead of creating one.
  edit?: EditTarget;
}) {
  const router = useRouter();
  const noteId = useId();
  const today = new Date().toISOString().slice(0, 10);

  // The types this template switches on. A request being edited keeps its own
  // type on the list even if an admin has since switched that type off.
  const options = useMemo(() => {
    const enabled = requestableRules(policy);
    const current = edit ? ruleFor(policy, edit.type) : undefined;
    return current && !current.enabled ? [...enabled, current] : enabled;
  }, [policy, edit]);

  const [type, setType] = useState(edit?.type ?? options[0]?.type ?? "annual");
  const [start, setStart] = useState(edit?.start ?? today);
  const [end, setEnd] = useState(edit?.end ?? today);
  const [halfStart, setHalfStart] = useState<HalfKind>(edit?.halfStart ?? "full");
  const [halfEnd, setHalfEnd] = useState<HalfKind>(edit?.halfEnd ?? "full");
  const [reason, setReason] = useState(edit?.reason ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rule = ruleFor(policy, type);
  const unit = rule?.unit ?? "working";
  // Calendar-day leave (maternity) runs in whole days.
  const halves = unit === "working";

  const holidayDates = useMemo(() => holidays.map((h) => h.date), [holidays]);

  const days = useMemo(() => {
    if (!start || !end || end < start) return 0;
    return countDaysForUnit(unit, start, end, halves ? halfStart : "full", halves ? halfEnd : "full", holidayDates);
  }, [unit, halves, start, end, halfStart, halfEnd, holidayDates]);

  const sameDay = start === end;
  // The request being edited is left out, so its current days don't count
  // against its new shape (whatever its type or year was).
  const available = useMemo(
    () => (start ? availableDays(policy, employment, rows, type, start, todayISO, edit?.id) : null),
    [policy, employment, rows, type, start, todayISO, edit?.id]
  );
  const overLimit = rule !== undefined && available !== null && days > 0 && days > available;

  const conflict = useMemo(() => {
    if (!start || !end) return null;
    for (const d of blockedDates) {
      if (d >= start && d <= end) return d;
    }
    return null;
  }, [start, end, blockedDates]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (conflict) {
      setError(`You already have a leave request that covers ${conflict}. Pick different dates, or edit or cancel the existing one under My requests.`);
      return;
    }
    if (overLimit && rule && available !== null) {
      setError(limitMessage(rule, available, days, start));
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch(edit ? `/api/leave/${edit.id}/edit` : "/api/leave", {
      method: edit ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type,
        start_date: start,
        end_date: end,
        half_start: halves ? halfStart : "full",
        half_end: halves ? (sameDay ? halfStart : halfEnd) : "full",
        reason: reason || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setSubmitting(false);
      setError(json.error || "Something went wrong.");
      return;
    }
    setReason("");
    router.push(calendarHref);
    router.refresh();
  }

  // The template's note for employees (how it's paid, what to bring) reads
  // across the whole form rather than squeezed under the select, and stays
  // tied to the select for screen readers.
  const note = rule?.note ?? null;

  // Each type says what it leaves you with for the chosen dates: days left in
  // that year for a yearly allowance; for anything else the cap, and how much
  // of it has been taken that year (the request being edited left out).
  const typeOptions = useMemo(
    () =>
      options.map((o) => {
        if (o.limit !== "per_year") {
          const year = Number(start.slice(0, 4));
          const { used, pending } = takenIn(rows, o.type, year, todayISO, edit?.id);
          const taken = used + pending;
          // "Booked": approved and pending alike, since both are spoken for.
          const suffix = taken > 0 ? ` · ${taken} booked in ${year}` : "";
          return { value: o.type, label: o.name, description: `${describeLimit(o)}${suffix}` };
        }
        const left = start ? availableDays(policy, employment, rows, o.type, start, todayISO, edit?.id) ?? 0 : 0;
        return {
          value: o.type,
          label: o.name,
          description: `${left} day${left === 1 ? "" : "s"} left in ${start.slice(0, 4)}`,
        };
      }),
    [options, policy, employment, rows, start, todayISO, edit?.id]
  );

  const allowanceText = !rule
    ? null
    : rule.limit === "unlimited"
      ? "no fixed limit"
      : rule.limit === "per_request"
        ? `up to ${available} per occasion`
        : `${available} ${leavePhrase(rule.name)} day${available === 1 ? "" : "s"} left in ${start.slice(0, 4)}`;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <span className="label">Pick the dates you'll be off</span>
        <DateRangePicker
          start={start}
          end={end}
          onChange={(s, e) => {
            setStart(s);
            setEnd(e);
          }}
          holidays={holidays}
          blocked={blockedDates}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Leave type">
          {(p) => (
            <Select
              {...p}
              aria-describedby={[p["aria-describedby"], note ? noteId : null].filter(Boolean).join(" ") || undefined}
              value={type}
              onChange={setType}
              options={typeOptions}
            />
          )}
        </Field>
        {halves && (
          <Field label={sameDay ? "Half-day?" : "First day"}>
            {(p) => (
              <Select {...p} value={halfStart} onChange={setHalfStart} options={HALF_DAY_OPTIONS} />
            )}
          </Field>
        )}
        {halves && !sameDay && (
          <Field label="Last day">
            {(p) => (
              <Select {...p} value={halfEnd} onChange={setHalfEnd} options={HALF_DAY_OPTIONS} />
            )}
          </Field>
        )}
      </div>

      {note && (
        <p id={noteId} className="-mt-3 max-w-prose text-xs text-neutral-500">
          {note}
        </p>
      )}

      <Field label="Reason (optional)">
        {(p) => (
          <textarea {...p} className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        )}
      </Field>

      {conflict && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <strong>Date already booked.</strong>{" "}
          You already have a leave request that covers <strong>{conflict}</strong>. Pick different dates, or edit or cancel the existing request under <strong>My requests</strong>.
        </div>
      )}

      {!conflict && overLimit && rule && available !== null && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <strong>{rule.limit === "per_request" ? "Too long." : "Not enough days."}</strong>{" "}
          {limitMessage(rule, available, days, start)}{" "}
          {halves ? "Shorten the range or take a half day." : "Shorten the range."}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-600">
          Total: <strong>{days}</strong> {unit === "calendar" ? "calendar" : "working"} day{days === 1 ? "" : "s"}
          {allowanceText && <span className="text-neutral-500"> · {allowanceText}</span>}
        </p>
        <button
          className="btn-accent w-full sm:w-auto"
          disabled={submitting || days === 0 || overLimit || !!conflict || !rule}
        >
          {edit
            ? submitting
              ? "Saving…"
              : "Save changes"
            : submitting
            ? "Submitting…"
            : "Submit request"}
        </button>
      </div>

      {edit?.status === "approved" && (
        <p className="text-xs text-amber-700">
          This request is already approved. Saving changes will send it back to your admin for re-approval.
        </p>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}
    </form>
  );
}
