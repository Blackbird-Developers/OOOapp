"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { countLeaveDays, type HalfKind } from "@/lib/days";
import Field from "@/components/Field";

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
      <Field label="Employee">
        {(p) => (
          <select {...p} className="input" value={userId} required onChange={(e) => setUserId(e.target.value)}>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.email})</option>
            ))}
          </select>
        )}
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Type">
          {(p) => (
            <select {...p} className="input" value={type} onChange={(e) => setType(e.target.value as "annual" | "sick")}>
              <option value="annual">Annual</option>
              <option value="sick">Sick</option>
            </select>
          )}
        </Field>
        <Field label="Start date">
          {(p) => (
            <input {...p} type="date" required className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          )}
        </Field>
        <Field label="End date">
          {(p) => (
            <input {...p} type="date" required className="input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          )}
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      <Field label="Note (optional)">
        {(p) => (
          <textarea {...p} className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        )}
      </Field>

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
        Mark as approved immediately
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-600">Total: <strong>{days}</strong> working day{days === 1 ? "" : "s"}</p>
        <button className="btn-accent w-full sm:w-auto" disabled={busy || days === 0 || !userId}>
          {busy ? "Saving…" : "Log leave"}
        </button>
      </div>

      {msg && (
        <p className={`text-sm ${msg.kind === "ok" ? "text-neutral-700" : "text-rose-700"}`}>
          {msg.kind === "ok" && (
            <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-brand-accent align-middle" />
          )}
          {msg.text}
        </p>
      )}
    </form>
  );
}
