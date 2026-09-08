"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { countLeaveDays, type HalfKind } from "@/lib/days";
import type { Balance } from "@/lib/balances";
import DateRangePicker from "@/components/DateRangePicker";
import Field from "@/components/Field";

export type EditTarget = {
  id: string;
  type: "annual" | "sick";
  start: string;
  end: string;
  halfStart: HalfKind;
  halfEnd: HalfKind;
  reason: string;
  status: "pending" | "approved";
};

export default function RequestLeaveForm({
  holidays,
  balance,
  blockedDates,
  calendarHref,
  edit,
}: {
  holidays: { date: string; name: string }[];
  balance: Balance;
  // ISO dates the user already has approved/pending leave on.
  blockedDates: string[];
  // Calendar page to land on after a successful submit.
  calendarHref: string;
  // When present, the form edits this existing request instead of creating one.
  edit?: EditTarget;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [type, setType] = useState<"annual" | "sick">(edit?.type ?? "annual");
  const [start, setStart] = useState(edit?.start ?? today);
  const [end, setEnd] = useState(edit?.end ?? today);
  const [halfStart, setHalfStart] = useState<HalfKind>(edit?.halfStart ?? "full");
  const [halfEnd, setHalfEnd] = useState<HalfKind>(edit?.halfEnd ?? "full");
  const [reason, setReason] = useState(edit?.reason ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const holidayDates = useMemo(() => holidays.map((h) => h.date), [holidays]);

  const days = useMemo(() => {
    if (!start || !end || end < start) return 0;
    return countLeaveDays(start, end, halfStart, halfEnd, holidayDates);
  }, [start, end, halfStart, halfEnd, holidayDates]);

  const sameDay = start === end;
  // When editing, the request being changed is already counted in the balance.
  // Add its days back to the matching type so the remaining figure reflects the
  // budget actually available to this request.
  const editAddBack = useMemo(() => {
    if (!edit || edit.type !== type) return 0;
    return countLeaveDays(edit.start, edit.end, edit.halfStart, edit.halfEnd, holidayDates);
  }, [edit, type, holidayDates]);
  const remaining = +(
    (type === "annual" ? balance.annual_remaining : balance.sick_remaining) + editAddBack
  ).toFixed(1);
  const overBalance = days > 0 && days > remaining;

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
    if (overBalance) {
      setError(
        remaining <= 0
          ? `You have no ${type} leave days remaining this year.`
          : `You only have ${remaining} ${type} day${remaining === 1 ? "" : "s"} left. This request is ${days} day${days === 1 ? "" : "s"}.`
      );
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
        half_start: halfStart,
        half_end: sameDay ? halfStart : halfEnd,
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
            <select {...p} className="input" value={type} onChange={(e) => setType(e.target.value as "annual" | "sick")}>
              <option value="annual">Annual</option>
              <option value="sick">Sick</option>
            </select>
          )}
        </Field>
        <Field label={sameDay ? "Half-day?" : "First day"}>
          {(p) => (
            <select {...p} className="input" value={halfStart} onChange={(e) => setHalfStart(e.target.value as HalfKind)}>
              <option value="full">Full day</option>
              <option value="am">Morning only (½)</option>
              <option value="pm">Afternoon only (½)</option>
            </select>
          )}
        </Field>
        {!sameDay && (
          <Field label="Last day">
            {(p) => (
              <select {...p} className="input" value={halfEnd} onChange={(e) => setHalfEnd(e.target.value as HalfKind)}>
                <option value="full">Full day</option>
                <option value="am">Morning only (½)</option>
                <option value="pm">Afternoon only (½)</option>
              </select>
            )}
          </Field>
        )}
      </div>

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

      {!conflict && overBalance && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <strong>Not enough days.</strong>{" "}
          {remaining <= 0
            ? `You have no ${type} leave days left this year.`
            : `You have ${remaining} ${type} day${remaining === 1 ? "" : "s"} left, but selected ${days}. Shorten the range or take a half day.`}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-600">
          Total: <strong>{days}</strong> working day{days === 1 ? "" : "s"}{" "}
          <span className="text-neutral-500">
            · {remaining} {type} day{remaining === 1 ? "" : "s"} remaining
          </span>
        </p>
        <button
          className="btn-accent w-full sm:w-auto"
          disabled={submitting || days === 0 || overBalance || !!conflict}
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
