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
        <h3 className="text-base font-medium text-neutral-900 tracking-tight">{format(cursor, "MMMM yyyy")}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCursor(addMonths(cursor, -1))}
            className="inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition"
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="rounded-md px-3 min-h-11 sm:min-h-0 sm:py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setCursor(addMonths(cursor, 1))}
            className="inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200">
        <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50/60">
          {[
            ["Mon", "M"], ["Tue", "T"], ["Wed", "W"], ["Thu", "T"], ["Fri", "F"], ["Sat", "S"], ["Sun", "S"],
          ].map(([long, short]) => (
            <div
              key={long}
              className="px-1 sm:px-3 py-2 sm:py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500"
            >
              <span className="hidden sm:inline">{long}</span>
              <span className="sm:hidden">{short}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-neutral-100">
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
                  weekend ? "bg-neutral-50/40" : ""
                } ${!inMonth ? "opacity-50" : ""}`}
              >
                <div className="flex items-start justify-between gap-1 mb-1 sm:mb-1.5">
                  {today ? (
                    <span
                      className="inline-flex h-5 sm:h-6 min-w-5 sm:min-w-6 items-center justify-center rounded-full bg-brand-accent px-1 sm:px-1.5 text-[10px] sm:text-[11px] font-bold text-brand-ink ring-1 ring-brand-ink/5"
                      aria-label={`Today, ${format(d, "EEEE d MMMM yyyy")}`}
                    >
                      {format(d, "d")}
                    </span>
                  ) : (
                    <span
                      className={`text-[11px] sm:text-xs font-medium leading-5 sm:leading-6 ${
                        inMonth ? "text-neutral-700" : "text-neutral-400"
                      }`}
                    >
                      {format(d, "d")}
                    </span>
                  )}
                  {holiday && (
                    <>
                      <span className="sm:hidden text-[10px]" title={holiday} aria-label={holiday}>·</span>
                      <span
                        className="hidden sm:inline truncate text-[9px] font-medium uppercase tracking-wide text-neutral-500"
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
                      ? `${ev.userName}: off`
                      : `${ev.userName}: ${ev.type} (${ev.status})`;
                    const hideOnMobile = idx >= mobileVisible;
                    const pending = ev.status === "pending";
                    return (
                      <div
                        key={ev.id + iso}
                        className={`${hideOnMobile ? "hidden sm:flex" : "flex"} items-center gap-1 truncate rounded sm:rounded-md px-1 sm:px-1.5 py-0 sm:py-0.5 text-[9px] sm:text-[11px] font-medium leading-tight ${badgeClass(ev, isPeer)} ${
                          pending ? "border border-dashed border-neutral-400" : ""
                        }`}
                        title={title}
                      >
                        <span aria-hidden className={`inline-block h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full shrink-0 ${dotClass(ev, isPeer)}`} />
                        <span className="truncate">{label}</span>
                      </div>
                    );
                  })}
                  {dayEvents.length > mobileVisible && (
                    <div className="text-[9px] text-neutral-500 px-1 sm:hidden">
                      +{dayEvents.length - mobileVisible}
                    </div>
                  )}
                  {dayEvents.length > desktopVisible && (
                    <div className="hidden sm:block text-[10px] text-neutral-500 px-1.5">
                      +{dayEvents.length - desktopVisible} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-xs text-neutral-500">
        <Legend swatch={<span className="h-2 w-2 rounded-full bg-violet-500" />}>Your annual</Legend>
        <Legend swatch={<span className="h-2 w-2 rounded-full bg-red-500" />}>Your sick</Legend>
        <Legend swatch={<span className="h-2 w-2 rounded-full bg-brand-accent/40" />}>Team mate</Legend>
        <Legend swatch={<span className="h-2 w-2 rounded-full border border-dashed border-neutral-400 bg-transparent" />}>Pending</Legend>
      </div>
    </div>
  );
}

function badgeClass(ev: CalendarEvent, isPeer: boolean) {
  if (ev.status === "pending") return "bg-neutral-50 text-neutral-700";
  if (isPeer) return "bg-brand-accent/40 text-neutral-800";
  // Your own approved leave is colour-coded by type so it stands out from colleagues.
  if (ev.type === "sick") return "bg-red-200 text-red-900";
  if (ev.type === "annual") return "bg-violet-200 text-violet-900";
  return "bg-brand-accent text-neutral-900";
}

function dotClass(ev: CalendarEvent, isPeer: boolean) {
  if (ev.status === "pending") return "bg-neutral-400";
  if (isPeer) return "bg-brand-ink/40";
  if (ev.type === "sick") return "bg-red-600";
  if (ev.type === "annual") return "bg-violet-600";
  return "bg-brand-ink";
}

function Legend({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  );
}
