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
}: {
  start: string; // ISO yyyy-MM-dd
  end: string;   // ISO yyyy-MM-dd
  onChange: (start: string, end: string) => void;
  holidays?: { date: string; name: string }[];
}) {
  const [cursor, setCursor] = useState(() => parseISO(start));
  // false = next click sets a new range start; true = next click sets the end
  const [pickingEnd, setPickingEnd] = useState(false);

  const holidayMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of holidays) m.set(h.date, h.name);
    return m;
  }, [holidays]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function handlePick(iso: string) {
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
        <h3 className="text-sm font-medium text-slate-700">{format(cursor, "MMMM yyyy")}</h3>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => setCursor(addMonths(cursor, -1))}>‹</button>
          <button type="button" className="btn-secondary" onClick={() => setCursor(new Date())}>Today</button>
          <button type="button" className="btn-secondary" onClick={() => setCursor(addMonths(cursor, 1))}>›</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-md overflow-hidden text-xs">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-slate-100 px-2 py-1 font-medium text-slate-600 text-center">{d}</div>
        ))}
        {days.map((d) => {
          const iso = format(d, "yyyy-MM-dd");
          const inMonth = isSameMonth(d, cursor);
          const weekend = isWeekend(d);
          const holiday = holidayMap.get(iso);
          const isStart = iso === start;
          const isEnd = iso === end;
          const inRange = iso > start && iso < end;
          const isEdge = isStart || isEnd;

          let cls = "bg-white text-slate-700 hover:bg-indigo-50 hover:text-indigo-700";
          if (!inMonth) cls = "bg-white text-slate-300 hover:bg-indigo-50 hover:text-indigo-700";
          else if (weekend) cls = "bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-700";
          if (inRange) cls = "bg-indigo-100 text-indigo-800 hover:bg-indigo-200";
          if (isEdge) cls = "bg-indigo-600 text-white font-semibold hover:bg-indigo-700";

          return (
            <button
              type="button"
              key={iso}
              onClick={() => handlePick(iso)}
              className={`relative min-h-[44px] p-1 text-left ${cls}`}
              title={holiday ? `🏖 ${holiday}` : undefined}
            >
              <span className={isToday(d) && !isEdge ? "inline-flex items-center justify-center w-5 h-5 rounded-full ring-1 ring-indigo-400" : ""}>
                {format(d, "d")}
              </span>
              {holiday && <span className="absolute top-0.5 right-1 text-[10px]">🏖</span>}
            </button>
          );
        })}
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
