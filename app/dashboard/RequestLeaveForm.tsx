"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { countLeaveDays, type HalfKind } from "@/lib/days";
import type { Balance } from "@/lib/balances";
import DateRangePicker from "@/components/DateRangePicker";

export default function RequestLeaveForm({
  holidays,
  balance,
}: {
  holidays: { date: string; name: string }[];
  balance: Balance;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [type, setType] = useState<"annual" | "sick">("annual");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [halfStart, setHalfStart] = useState<HalfKind>("full");
  const [halfEnd, setHalfEnd] = useState<HalfKind>("full");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const holidayDates = useMemo(() => holidays.map((h) => h.date), [holidays]);

  const days = useMemo(() => {
    if (!start || !end || end < start) return 0;
    return countLeaveDays(start, end, halfStart, halfEnd, holidayDates);
  }, [start, end, halfStart, halfEnd, holidayDates]);

  const sameDay = start === end;
  const remaining = type === "annual" ? balance.annual_remaining : balance.sick_remaining;
  const overBalance = days > 0 && days > remaining;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (overBalance) {
      setError(
        remaining <= 0
          ? `You have no ${type} leave days remaining this year.`
          : `You only have ${remaining} ${type} day${remaining === 1 ? "" : "s"} remaining — this request is ${days} day${days === 1 ? "" : "s"}.`
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    const res = await fetch("/api/leave", {
      method: "POST",
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
    setSubmitting(false);
    if (!res.ok) {
      setError(json.error || "Something went wrong.");
      return;
    }
    setSuccess(`Request submitted (${json.days} day${json.days === 1 ? "" : "s"}). Admin has been notified.`);
    setReason("");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label className="label">Pick the dates you'll be off</label>
        <DateRangePicker
          start={start}
          end={end}
          onChange={(s, e) => {
            setStart(s);
            setEnd(e);
          }}
          holidays={holidays}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="label">Leave type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as "annual" | "sick")}>
            <option value="annual">Annual</option>
            <option value="sick">Sick</option>
          </select>
        </div>
        <div>
          <label className="label">{sameDay ? "Half-day?" : "First day"}</label>
          <select className="input" value={halfStart} onChange={(e) => setHalfStart(e.target.value as HalfKind)}>
            <option value="full">Full day</option>
            <option value="am">Morning only (½)</option>
            <option value="pm">Afternoon only (½)</option>
          </select>
        </div>
        {!sameDay && (
          <div>
            <label className="label">Last day</label>
            <select className="input" value={halfEnd} onChange={(e) => setHalfEnd(e.target.value as HalfKind)}>
              <option value="full">Full day</option>
              <option value="am">Morning only (½)</option>
              <option value="pm">Afternoon only (½)</option>
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="label">Reason (optional)</label>
        <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>

      {overBalance && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Not enough days.</strong>{" "}
          {remaining <= 0
            ? `You have no ${type} leave days remaining this year.`
            : `You have ${remaining} ${type} day${remaining === 1 ? "" : "s"} left but selected ${days} day${days === 1 ? "" : "s"}. Reduce your range or pick a half-day.`}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Total: <strong>{days}</strong> working day{days === 1 ? "" : "s"}{" "}
          <span className="text-slate-400">
            · {remaining} {type} day{remaining === 1 ? "" : "s"} remaining
          </span>
        </p>
        <button className="btn-primary" disabled={submitting || days === 0 || overBalance}>
          {submitting ? "Submitting…" : "Submit request"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">{success}</p>}
    </form>
  );
}
