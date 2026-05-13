"use client";

import { useMemo, useState } from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameMonth, isToday, isWeekend, parseISO, startOfMonth, startOfWeek,
} from "date-fns";

export type CalendarEvent = {
  id: string;
  userId: string;
  userName: string;
  type: "annual" | "sick";
  status: "pending" | "approved" | "rejected" | "cancelled";
  start: string;
  end: string;
};

export default function LeaveCalendar({
  events,
  holidays,
  viewerUserId,
}: {
  events: CalendarEvent[];
  holidays: { date: string; name: string }[];
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
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-medium text-slate-900 tracking-tight">{format(cursor, "MMMM yyyy")}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCursor(addMonths(cursor, -1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setCursor(addMonths(cursor, 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/60">
          {[
            ["Mon", "M"], ["Tue", "T"], ["Wed", "W"], ["Thu", "T"], ["Fri", "F"], ["Sat", "S"], ["Sun", "S"],
          ].map(([long, short]) => (
            <div
              key={long}
              className="px-1 sm:px-3 py-2 sm:py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500"
            >
              <span className="hidden sm:inline">{long}</span>
              <span className="sm:hidden">{short}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-slate-100">
          {days.map((d) => {
            const iso = format(d, "yyyy-MM-dd");
            const dayEvents = eventsByDay.get(iso) ?? [];
            const holiday = holidayMap.get(iso);
            const inMonth = isSameMonth(d, cursor);
            const weekend = isWeekend(d);
            const today = isToday(d);
            // Show fewer events on mobile to keep cells compact.
            const mobileVisible = 1;
            const desktopVisible = 3;

            return (
              <div
                key={iso}
                className={`bg-white p-1 sm:p-2 transition-colors min-h-[68px] sm:min-h-[104px] ${
                  weekend ? "bg-slate-50/40" : ""
                } ${!inMonth ? "opacity-50" : ""}`}
              >
                <div className="flex items-start justify-between gap-1 mb-1 sm:mb-1.5">
                  {today ? (
                    <span className="inline-flex h-5 sm:h-6 min-w-5 sm:min-w-6 items-center justify-center rounded-full bg-slate-900 px-1 sm:px-1.5 text-[10px] sm:text-[11px] font-semibold text-white">
                      {format(d, "d")}
                    </span>
                  ) : (
                    <span
                      className={`text-[11px] sm:text-xs font-medium leading-5 sm:leading-6 ${
                        inMonth ? "text-slate-700" : "text-slate-300"
                      }`}
                    >
                      {format(d, "d")}
                    </span>
                  )}
                  {holiday && (
                    <>
                      <span className="sm:hidden text-[10px]" title={holiday} aria-label={holiday}>·</span>
                      <span
                        className="hidden sm:inline truncate text-[9px] font-medium uppercase tracking-wide text-amber-700"
                        title={holiday}
                      >
                        Holiday
                      </span>
                    </>
                  )}
                </div>
                <div className="space-y-0.5 sm:space-y-1">
                  {dayEvents.slice(0, desktopVisible).map((ev, idx) => {
                    const isPeer = viewerUserId !== undefined && ev.userId !== viewerUserId;
                    const label = isPeer
                      ? ev.userName.split(" ")[0]
                      : `${ev.userName.split(" ")[0]} · ${ev.type[0].toUpperCase()}`;
                    const title = isPeer
                      ? `${ev.userName} — off`
                      : `${ev.userName} — ${ev.type} (${ev.status})`;
                    const hideOnMobile = idx >= mobileVisible;
                    return (
                      <div
                        key={ev.id + iso}
                        className={`${hideOnMobile ? "hidden sm:flex" : "flex"} items-center gap-1 truncate rounded sm:rounded-md px-1 sm:px-1.5 py-0 sm:py-0.5 text-[9px] sm:text-[11px] font-medium leading-tight ${badgeClass(ev, isPeer)}`}
                        title={title}
                      >
                        <span className={`inline-block h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full shrink-0 ${dotClass(ev, isPeer)}`} />
                        <span className="truncate">{label}</span>
                      </div>
                    );
                  })}
                  {dayEvents.length > mobileVisible && (
                    <div className="text-[9px] text-slate-400 px-1 sm:hidden">
                      +{dayEvents.length - mobileVisible}
                    </div>
                  )}
                  {dayEvents.length > desktopVisible && (
                    <div className="hidden sm:block text-[10px] text-slate-400 px-1.5">
                      +{dayEvents.length - desktopVisible} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-xs text-slate-500">
        <LegendDot tone="emerald" label="Annual · approved" />
        <LegendDot tone="rose" label="Sick · approved" />
        <LegendDot tone="amber" label="Pending" />
        <LegendDot tone="slate" label="Team mate · off" />
      </div>
    </div>
  );
}

function badgeClass(ev: CalendarEvent, isPeer: boolean) {
  if (isPeer) return "bg-slate-100 text-slate-700";
  if (ev.status === "pending") return "bg-amber-50 text-amber-800";
  if (ev.status === "approved" && ev.type === "annual") return "bg-emerald-50 text-emerald-800";
  if (ev.status === "approved" && ev.type === "sick") return "bg-rose-50 text-rose-800";
  return "bg-slate-50 text-slate-600";
}

function dotClass(ev: CalendarEvent, isPeer: boolean) {
  if (isPeer) return "bg-slate-400";
  if (ev.status === "pending") return "bg-amber-500";
  if (ev.status === "approved" && ev.type === "annual") return "bg-emerald-500";
  if (ev.status === "approved" && ev.type === "sick") return "bg-rose-500";
  return "bg-slate-400";
}

function LegendDot({
  tone,
  label,
}: {
  tone: "emerald" | "rose" | "amber" | "slate";
  label: string;
}) {
  const color =
    tone === "emerald" ? "bg-emerald-500"
    : tone === "rose" ? "bg-rose-500"
    : tone === "amber" ? "bg-amber-500"
    : "bg-slate-400";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
