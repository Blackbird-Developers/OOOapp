"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { countLeaveDays, datesInRange, type HalfKind } from "@/lib/days";
import DateRangePicker, { type TeamOff } from "@/components/DateRangePicker";
import Field from "@/components/Field";

type Employee = { id: string; full_name: string; email: string };

/** An approved or pending request, as the page loads them for the calendar. */
export type ActiveLeave = {
  user_id: string;
  type: "annual" | "sick";
  status: "approved" | "pending";
  start_date: string;
  end_date: string;
};

export default function AdminLogLeaveForm({
  employees, holidays, leave, leaveFrom,
}: {
  employees: Employee[];
  holidays: { date: string; name: string }[];
  // Everyone's active leave that ends on or after `leaveFrom`.
  leave: ActiveLeave[];
  leaveFrom: string;
}) {
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
  // Set when the API rejects with a hierarchy conflict (409). Holds the exact
  // payload that was rejected, so "Log anyway" overrides that submission even
  // if the form fields have been edited since.
  const [conflict, setConflict] = useState<{ text: string; payload: Record<string, unknown> } | null>(null);
  // Bumped after each logged entry to remount the calendar, so the next click
  // starts a fresh range instead of finishing the one just saved.
  const [entry, setEntry] = useState(0);

  const holidayDates = useMemo(() => holidays.map((h) => h.date), [holidays]);
  const employee = employees.find((emp) => emp.id === userId);
  const firstName = employee?.full_name.split(" ")[0] ?? "";

  // The chosen employee's own leave blocks its days (the API rejects overlaps);
  // everyone else's is shown in the calendar as context.
  const { blocked, teamOff } = useMemo(() => {
    const names = new Map(employees.map((emp) => [emp.id, emp.full_name]));
    const nameOf = (r: ActiveLeave) => names.get(r.user_id) ?? "Employee";
    const blockedDays = new Set<string>();
    const byDay = new Map<string, TeamOff[]>();
    const seen = new Set<string>();
    // Earliest-starting (then longest) leave first, like a calendar app, so a
    // person keeps the same row on every day of their leave.
    const ordered = [...leave].sort(
      (a, b) =>
        a.start_date.localeCompare(b.start_date) ||
        b.end_date.localeCompare(a.end_date) ||
        nameOf(a).localeCompare(nameOf(b))
    );
    for (const r of ordered) {
      for (const day of datesInRange(r.start_date, r.end_date)) {
        if (r.user_id === userId) {
          blockedDays.add(day);
          continue;
        }
        if (seen.has(`${day}|${r.user_id}`)) continue;
        seen.add(`${day}|${r.user_id}`);
        const person = { name: nameOf(r), type: r.type, status: r.status };
        const list = byDay.get(day);
        if (list) list.push(person);
        else byDay.set(day, [person]);
      }
    }
    return { blocked: [...blockedDays].sort(), teamOff: byDay };
  }, [leave, employees, userId]);

  // First day of the selection the employee already has leave on.
  const overlap = useMemo(
    () => blocked.find((d) => d >= start && d <= end) ?? null,
    [blocked, start, end]
  );

  const sameDay = start === end;
  const days = useMemo(() => {
    if (!start || !end || end < start) return 0;
    return countLeaveDays(start, end, halfStart, halfEnd, holidayDates);
  }, [start, end, halfStart, halfEnd, holidayDates]);

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    setConflict(null);
    const res = await fetch("/api/leave", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      if (res.status === 409 && json.conflict) {
        setConflict({ text: json.error, payload });
        return;
      }
      setMsg({ kind: "err", text: json.error || "Couldn't log the leave. Try again." });
      return;
    }
    setMsg({ kind: "ok", text: `Logged ${json.days} day${json.days === 1 ? "" : "s"} for that employee. They've been emailed.` });
    setReason("");
    setEntry((n) => n + 1);
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await send({
      user_id: userId,
      type,
      start_date: start,
      end_date: end,
      half_start: halfStart,
      half_end: sameDay ? halfStart : halfEnd,
      reason: reason || null,
      auto_approve: autoApprove,
    });
  }

  async function logAnyway() {
    if (!conflict) return;
    await send({ ...conflict.payload, override_conflicts: true });
  }

  // Once saved, the refreshed calendar shows the new entry as booked. Until the
  // admin picks another employee or other dates, that is the confirmation, not
  // a clash to warn about.
  const justLogged = msg?.kind === "ok";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Employee">
        {(p) => (
          <select
            {...p}
            className="input"
            value={userId}
            required
            onChange={(e) => {
              setUserId(e.target.value);
              setMsg(null);
            }}
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.email})</option>
            ))}
          </select>
        )}
      </Field>

      <div>
        <span className="label">Dates</span>
        <DateRangePicker
          key={entry}
          start={start}
          end={end}
          onChange={(s, e) => {
            setStart(s);
            setEnd(e);
            setMsg(null);
          }}
          holidays={holidays}
          blocked={blocked}
          bookingFor={firstName}
          allowPast
          teamOff={teamOff}
          teamOffFrom={leaveFrom}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Type">
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

      <Field label="Note (optional)">
        {(p) => (
          <textarea {...p} className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        )}
      </Field>

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
        Mark as approved immediately
      </label>

      {overlap && !justLogged && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <strong>Date already booked.</strong>{" "}
          {employee?.full_name} already has leave that covers <strong>{overlap}</strong>. Pick different dates, or cancel the existing request under <strong>Requests</strong> first.
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-600">Total: <strong>{days}</strong> working day{days === 1 ? "" : "s"}</p>
        <button className="btn-accent w-full sm:w-auto" disabled={busy || days === 0 || !userId || !!overlap}>
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

      {conflict && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800 space-y-3">
          <p>{conflict.text}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="btn-danger" disabled={busy} onClick={logAnyway}>
              {busy ? "Saving…" : "Log anyway"}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConflict(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
