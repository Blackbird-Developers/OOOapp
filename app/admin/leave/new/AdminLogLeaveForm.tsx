"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { countLeaveDays, type HalfKind } from "@/lib/days";

type Employee = { id: string; full_name: string; email: string };

export default function AdminLogLeaveForm({
  employees, holidays,
}: { employees: Employee[]; holidays: string[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [userId, setUserId] = useState(employees[0]?.id ?? "");
  const [type, setType] = useState<"annual" | "sick">("sick");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [halfStart, setHalfStart] = useState<HalfKind>("full");
  const [halfEnd, setHalfEnd] = useState<HalfKind>("full");
  const [reason, setReason] = useState("");
  const [autoApprove, setAutoApprove] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const sameDay = start === end;
  const days = useMemo(() => {
    if (!start || !end || end < start) return 0;
    return countLeaveDays(start, end, halfStart, halfEnd, holidays);
  }, [start, end, halfStart, halfEnd, holidays]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/leave", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        type,
        start_date: start,
        end_date: end,
        half_start: halfStart,
        half_end: sameDay ? halfStart : halfEnd,
        reason: reason || null,
        auto_approve: autoApprove,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: "err", text: json.error || "Couldn't log the leave. Try again." });
      return;
    }
    setMsg({ kind: "ok", text: `Logged ${json.days} day${json.days === 1 ? "" : "s"} for that employee. They've been emailed.` });
    setReason("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label">Employee</label>
        <select className="input" value={userId} required onChange={(e) => setUserId(e.target.value)}>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.full_name} ({e.email})</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="label">Type</label>
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
        <label className="label">Note (optional)</label>
        <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
        Mark as approved immediately
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">Total: <strong>{days}</strong> working day{days === 1 ? "" : "s"}</p>
        <button className="btn-primary w-full sm:w-auto" disabled={busy || days === 0 || !userId}>
          {busy ? "Saving…" : "Log leave"}
        </button>
      </div>

      {msg && (
        <p className={`text-sm ${msg.kind === "ok" ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>
      )}
    </form>
  );
}
