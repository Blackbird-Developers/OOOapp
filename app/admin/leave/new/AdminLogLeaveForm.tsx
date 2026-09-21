"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { countDaysForUnit, datesInRange, HALF_DAY_OPTIONS, type HalfKind } from "@/lib/days";
import { describeLimit, leavePhrase, type LeaveTypeRule } from "@/lib/leave-rules";
import DateRangePicker, { type TeamOff } from "@/components/DateRangePicker";
import Field from "@/components/Field";
import Select, { Initials } from "@/components/Select";

export type Employee = {
  id: string;
  full_name: string;
  email: string;
  /** Their leave template's name; null before leave policies are set up. */
  policyName: string | null;
  /** The types their template switches on. */
  rules: LeaveTypeRule[];
};

/** An approved or pending request, as the page loads them for the calendar. */
export type ActiveLeave = {
  user_id: string;
  type: string;
  status: "approved" | "pending";
  start_date: string;
  end_date: string;
};

export default function AdminLogLeaveForm({
  employees, typeNames, holidays, leave, leaveFrom,
}: {
  employees: Employee[];
  // Display names for every leave type, for the "also off" descriptions.
  typeNames: Record<string, string>;
  holidays: { date: string; name: string }[];
  // Everyone's active leave that ends on or after `leaveFrom`.
  leave: ActiveLeave[];
  leaveFrom: string;
}) {
  const router = useRouter();
  const noteId = useId();
  const today = new Date().toISOString().slice(0, 10);

  const [userId, setUserId] = useState(employees[0]?.id ?? "");
  // Sick days phoned in are the most common thing logged here.
  const [type, setType] = useState(
    () => (employees[0]?.rules.find((r) => r.type === "sick") ?? employees[0]?.rules[0])?.type ?? "sick"
  );
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
  const options = employee?.rules ?? [];
  const rule = options.find((r) => r.type === type);
  const unit = rule?.unit ?? "working";
  // Calendar-day leave (maternity) runs in whole days.
  const halves = unit === "working";

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
        const person = { name: nameOf(r), type: leavePhrase(typeNames[r.type] ?? r.type), status: r.status };
        const list = byDay.get(day);
        if (list) list.push(person);
        else byDay.set(day, [person]);
      }
    }
    return { blocked: [...blockedDays].sort(), teamOff: byDay };
  }, [leave, employees, userId, typeNames]);

  // First day of the selection the employee already has leave on.
  const overlap = useMemo(
    () => blocked.find((d) => d >= start && d <= end) ?? null,
    [blocked, start, end]
  );

  const sameDay = start === end;
  const days = useMemo(() => {
    if (!start || !end || end < start) return 0;
    return countDaysForUnit(unit, start, end, halves ? halfStart : "full", halves ? halfEnd : "full", holidayDates);
  }, [unit, halves, start, end, halfStart, halfEnd, holidayDates]);

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
      half_start: halves ? halfStart : "full",
      half_end: halves ? (sameDay ? halfStart : halfEnd) : "full",
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
      <Field label="Employee" hint={employee?.policyName ? `Leave policy: ${employee.policyName}` : undefined}>
        {(p) => (
          <Select
            {...p}
            value={userId}
            searchable
            searchPlaceholder="Search people"
            options={employees.map((emp) => ({
              value: emp.id,
              label: emp.full_name,
              description: emp.email,
              leading: <Initials name={emp.full_name} />,
            }))}
            onChange={(id) => {
              const next = employees.find((emp) => emp.id === id);
              setUserId(id);
              // Keep the type if their template has it too; otherwise fall back.
              if (next && !next.rules.some((r) => r.type === type)) {
                setType((next.rules.find((r) => r.type === "sick") ?? next.rules[0])?.type ?? "sick");
              }
              setMsg(null);
            }}
          />
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
            <Select
              {...p}
              aria-describedby={[p["aria-describedby"], rule?.note ? noteId : null].filter(Boolean).join(" ") || undefined}
              value={type}
              onChange={setType}
              options={options.map((o) => ({ value: o.type, label: o.name, description: describeLimit(o) }))}
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

      {rule?.note && (
        <p id={noteId} className="-mt-1 max-w-prose text-xs text-neutral-500">
          {rule.note}
        </p>
      )}

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
        <p className="text-sm text-neutral-600">Total: <strong>{days}</strong> {unit === "calendar" ? "calendar" : "working"} day{days === 1 ? "" : "s"}</p>
        <button className="btn-accent w-full sm:w-auto" disabled={busy || days === 0 || !userId || !!overlap || !rule}>
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
