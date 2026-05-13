"use client";

import { useMemo, useState } from "react";
import {
  addMonths, endOfMonth, endOfWeek, format, isSameMonth, isWeekend,
  startOfMonth, startOfWeek, parseISO, eachDayOfInterval,
} from "date-fns";

export type CalendarEvent = {
  id: string;
  userId: string;
  userName: string;
  type: "annual" | "sick";
  status: "pending" | "approved" | "rejected" | "cancelled";
  start: string; // ISO date
  end: string;   // ISO date
};

export default function LeaveCalendar({
  events,
  holidays,
  viewerUserId,
}: {
  events: CalendarEvent[];
  holidays: { date: string; name: string }[];
  // When set, events belonging to other users render in a neutral style
  // and hide the leave type. Leave undefined for admin views.
  viewerUserId?: string;
}) {
  const [cursor, setCursor] = useState(new Date());

  const holidayMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of holidays) m.set(h.date, h.name);
    return m;
  }, [holidays]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const days = eachDayOfInterval({ start: parseISO(ev.start), end: parseISO(ev.end) });
      for (const d of days) {
        const k = format(d, "yyyy-MM-dd");
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(ev);
      }
    }
    return m;
  }, [events]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">{format(cursor, "MMMM yyyy")}</h3>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setCursor(addMonths(cursor, -1))}>‹ Prev</button>
          <button className="btn-secondary" onClick={() => setCursor(new Date())}>Today</button>
          <button className="btn-secondary" onClick={() => setCursor(addMonths(cursor, 1))}>Next ›</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-md overflow-hidden text-xs">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-slate-100 px-2 py-1 font-medium text-slate-600">{d}</div>
        ))}
        {days.map((d) => {
          const iso = format(d, "yyyy-MM-dd");
          const dayEvents = eventsByDay.get(iso) ?? [];
          const holiday = holidayMap.get(iso);
          const inMonth = isSameMonth(d, cursor);
          const weekend = isWeekend(d);
          return (
            <div
              key={iso}
              className={`bg-white min-h-[88px] p-1 align-top ${!inMonth ? "opacity-40" : ""} ${weekend ? "bg-slate-50" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{format(d, "d")}</span>
                {holiday && (
                  <span className="text-[10px] text-amber-700 truncate ml-1" title={holiday}>
                    🏖 {holiday}
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-0.5">
                {dayEvents.slice(0, 3).map((ev) => {
                  const isPeer = viewerUserId !== undefined && ev.userId !== viewerUserId;
                  const label = isPeer
                    ? ev.userName.split(" ")[0]
                    : `${ev.userName.split(" ")[0]} · ${ev.type[0].toUpperCase()}`;
                  const title = isPeer
                    ? `${ev.userName} — off`
                    : `${ev.userName} — ${ev.type} (${ev.status})`;
                  return (
                    <div
                      key={ev.id + iso}
                      className={`truncate rounded px-1 py-0.5 text-[11px] ${badgeClass(ev, isPeer)}`}
                      title={title}
                    >
                      {label}
                    </div>
                  );
                })}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-slate-500">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-600">
        <Legend className="bg-emerald-100 text-emerald-800">Annual · approved</Legend>
        <Legend className="bg-rose-100 text-rose-800">Sick · approved</Legend>
        <Legend className="bg-amber-100 text-amber-800">Pending</Legend>
        <Legend className="bg-slate-100 text-slate-700">🏖 Public holiday</Legend>
      </div>
    </div>
  );
}

function badgeClass(ev: CalendarEvent, isPeer: boolean) {
  if (isPeer) return "bg-slate-200 text-slate-700";
  if (ev.status === "pending") return "bg-amber-100 text-amber-800";
  if (ev.status === "approved" && ev.type === "annual") return "bg-emerald-100 text-emerald-800";
  if (ev.status === "approved" && ev.type === "sick") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-600";
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 ${className}`}>{children}</span>;
}
