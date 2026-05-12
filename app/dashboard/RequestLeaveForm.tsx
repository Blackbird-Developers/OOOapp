"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { countLeaveDays, type HalfKind } from "@/lib/days";

export default function RequestLeaveForm({ holidays }: { holidays: string[] }) {
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

  const days = useMemo(() => {
    if (!start || !end || end < start) return 0;
    return countLeaveDays(start, end, halfStart, halfEnd, holidays);
  }, [start, end, halfStart, halfEnd, holidays]);

  const sameDay = start === end;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="label">Leave type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as "annual" | "sick")}>
            <option value="annual">Annual</option>
            <option value="sick">Sick</option>
          </select>
        </div>
        <div>
          <label className="label">Start date</label>
          <input type="date" required className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="label">End date</label>
          <input type="date" required className="input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Total: <strong>{days}</strong> working day{days === 1 ? "" : "s"}{" "}
          <span className="text-slate-400">(excludes weekends and public holidays)</span>
        </p>
        <button className="btn-primary" disabled={submitting || days === 0}>
          {submitting ? "Submitting…" : "Submit request"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">{success}</p>}
    </form>
  );
}
