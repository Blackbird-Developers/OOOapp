"use client";

import { useMemo, useState } from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameMonth, isToday, isWeekend, parseISO, startOfMonth, startOfWeek,
} from "date-fns";

export default function DateRangePicker({
  start,
  end,
  onChange,
  holidays = [],
  blocked = [],
}: {
  start: string; // ISO yyyy-MM-dd
  end: string;   // ISO yyyy-MM-dd
  onChange: (start: string, end: string) => void;
  holidays?: { date: string; name: string }[];
  // ISO dates the viewer already has approved/pending leave for — not selectable.
  blocked?: string[];
}) {
  const [cursor, setCursor] = useState(() => parseISO(start));
  // false = next click sets a new range start; true = next click sets the end
  const [pickingEnd, setPickingEnd] = useState(false);

  const holidayMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of holidays) m.set(h.date, h.name);
    return m;
  }, [holidays]);

  const blockedSet = useMemo(() => new Set(blocked), [blocked]);
  const todayISO = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function handlePick(iso: string) {
    if (blockedSet.has(iso)) return;
    if (iso < todayISO) return;
    if (!pickingEnd) {
      onChange(iso, iso);
      setPickingEnd(true);
    } else {
      if (iso >= start) onChange(start, iso);
      else onChange(iso, start);
      setPickingEnd(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
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

      <div className="overflow-hidden rounded-xl border border-slate-200 text-xs">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/60">
          {[
            ["Mon", "M"], ["Tue", "T"], ["Wed", "W"], ["Thu", "T"], ["Fri", "F"], ["Sat", "S"], ["Sun", "S"],
          ].map(([long, short]) => (
            <div
              key={long}
              className="px-1 sm:px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500"
            >
              <span className="hidden sm:inline">{long}</span>
              <span className="sm:hidden">{short}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-slate-100">
          {days.map((d) => {
            const iso = format(d, "yyyy-MM-dd");
            const inMonth = isSameMonth(d, cursor);
            const weekend = isWeekend(d);
            const holiday = holidayMap.get(iso);
            const isStart = iso === start;
            const isEnd = iso === end;
            const inRange = iso > start && iso < end;
            const isEdge = isStart || isEnd;
            const isBlocked = blockedSet.has(iso);
            const isPast = iso < todayISO;

            let cls = "bg-white text-slate-700 hover:bg-indigo-50 hover:text-indigo-700";
            if (!inMonth) cls = "bg-white text-slate-300 hover:bg-indigo-50 hover:text-indigo-700";
            else if (weekend) cls = "bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-700";
            if (inRange) cls = "bg-indigo-100 text-indigo-800 hover:bg-indigo-200";
            if (isEdge) cls = "bg-indigo-600 text-white font-semibold hover:bg-indigo-700";
            if (isPast) cls = "bg-slate-50 text-slate-300 cursor-not-allowed hover:bg-slate-50";
            if (isBlocked) cls = "bg-rose-100 text-rose-700 line-through cursor-not-allowed hover:bg-rose-100";

            const disabled = isBlocked || isPast;
            return (
              <button
                type="button"
                key={iso}
                onClick={() => handlePick(iso)}
                disabled={disabled}
                className={`relative min-h-[44px] sm:min-h-[48px] p-1 text-left transition-colors ${cls}`}
                title={
                  isBlocked
                    ? "You already have leave requested for this day"
                    : isPast
                    ? "Past dates can't be requested"
                    : holiday
                    ? `🏖 ${holiday}`
                    : undefined
                }
              >
                <span className={isToday(d) && !isEdge && !disabled ? "inline-flex items-center justify-center w-5 h-5 rounded-full ring-1 ring-indigo-400" : ""}>
                  {format(d, "d")}
                </span>
                {holiday && !disabled && <span className="absolute top-0.5 right-1 text-[10px]">🏖</span>}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-slate-500 mt-2">
        {pickingEnd
          ? "Now click the last day of your time off (or click the same day for a one-day request)."
          : start === end
          ? `Selected: ${start}`
          : `Selected: ${start} → ${end}`}
      </p>
    </div>
  );
}
