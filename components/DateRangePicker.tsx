"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, endOfYear, format,
  isSameMonth, isToday, isWeekend, parseISO, startOfMonth, startOfWeek, startOfYear,
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
  // ISO dates the viewer already has approved/pending leave for; not selectable.
  blocked?: string[];
}) {
  const [cursor, setCursor] = useState(() => parseISO(start));
  // false = next click sets a new range start; true = next click sets the end
  const [pickingEnd, setPickingEnd] = useState(false);
  // The cell currently in the tab order (roving tabindex).
  const [focused, setFocused] = useState<string>(start);
  // Set when the user moves focus with the keyboard; we then focus the new
  // cell after render. Avoids stealing focus when state updates for other reasons.
  const focusNext = useRef(false);

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

  const cellRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    const el = cellRefs.current.get(focused);
    el?.focus();
  }, [focused]);

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

  function moveFocus(delta: { days?: number; months?: number; toWeekStart?: boolean; toWeekEnd?: boolean; toYearStart?: boolean; toYearEnd?: boolean }) {
    const current = parseISO(focused);
    let next = current;
    if (delta.days) next = addDays(current, delta.days);
    else if (delta.months) next = addMonths(current, delta.months);
    else if (delta.toWeekStart) next = startOfWeek(current, { weekStartsOn: 1 });
    else if (delta.toWeekEnd) next = endOfWeek(current, { weekStartsOn: 1 });
    else if (delta.toYearStart) next = startOfYear(current);
    else if (delta.toYearEnd) next = endOfYear(current);

    const nextISO = format(next, "yyyy-MM-dd");
    if (!isSameMonth(next, cursor)) setCursor(next);
    focusNext.current = true;
    setFocused(nextISO);
  }

  function onGridKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowLeft":  e.preventDefault(); moveFocus({ days: -1 }); break;
      case "ArrowRight": e.preventDefault(); moveFocus({ days: 1 });  break;
      case "ArrowUp":    e.preventDefault(); moveFocus({ days: -7 }); break;
      case "ArrowDown":  e.preventDefault(); moveFocus({ days: 7 });  break;
      case "Home":       e.preventDefault(); moveFocus({ toWeekStart: true }); break;
      case "End":        e.preventDefault(); moveFocus({ toWeekEnd: true });   break;
      case "PageUp":
        e.preventDefault();
        moveFocus(e.shiftKey ? { toYearStart: true } : { months: -1 });
        break;
      case "PageDown":
        e.preventDefault();
        moveFocus(e.shiftKey ? { toYearEnd: true } : { months: 1 });
        break;
      default:
    }
  }

  // If the selected start changes from outside, keep focus on a reasonable cell.
  useEffect(() => {
    setFocused(start);
  }, [start]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-medium text-neutral-900 tracking-tight" id="date-picker-label">
          {format(cursor, "MMMM yyyy")}
        </h3>
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

      <div className="overflow-hidden rounded-xl border border-neutral-200 text-xs">
        <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50/60">
          {[
            ["Mon", "M"], ["Tue", "T"], ["Wed", "W"], ["Thu", "T"], ["Fri", "F"], ["Sat", "S"], ["Sun", "S"],
          ].map(([long, short]) => (
            <div
              key={long}
              className="px-1 sm:px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500"
            >
              <span className="hidden sm:inline">{long}</span>
              <span className="sm:hidden">{short}</span>
            </div>
          ))}
        </div>
        <div
          role="grid"
          aria-labelledby="date-picker-label"
          onKeyDown={onGridKeyDown}
          className="grid grid-cols-7 gap-px bg-neutral-100"
        >
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

            let cls = "bg-white text-neutral-700 hover:bg-neutral-100";
            if (!inMonth) cls = "bg-white text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700";
            else if (weekend) cls = "bg-neutral-50 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700";
            if (inRange) cls = "bg-neutral-200 text-neutral-800 hover:bg-neutral-300";
            if (isEdge) cls = "bg-neutral-900 text-white font-semibold hover:bg-neutral-800";
            if (isPast) cls = "bg-neutral-50 text-neutral-400 cursor-not-allowed hover:bg-neutral-50";
            if (isBlocked) cls = "bg-rose-100 text-rose-700 line-through cursor-not-allowed hover:bg-rose-100";

            const disabled = isBlocked || isPast;
            const isFocused = iso === focused;
            const ariaLabel = format(d, "EEEE, d MMMM yyyy") +
              (isBlocked ? " — already booked" : isPast ? " — past" : holiday ? ` — ${holiday}` : "");

            return (
              <button
                ref={(el) => {
                  cellRefs.current.set(iso, el);
                }}
                type="button"
                role="gridcell"
                aria-selected={isEdge || inRange}
                aria-label={ariaLabel}
                aria-disabled={disabled || undefined}
                tabIndex={isFocused ? 0 : -1}
                key={iso}
                onClick={() => {
                  setFocused(iso);
                  if (!disabled) handlePick(iso);
                }}
                className={`relative min-h-[44px] sm:min-h-[48px] p-1 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-inset ${cls}`}
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
                <span
                  className={
                    isToday(d) && !isEdge && !disabled
                      ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-accent font-bold text-brand-ink ring-1 ring-brand-ink/5"
                      : ""
                  }
                >
                  {format(d, "d")}
                </span>
                {holiday && !disabled && <span aria-hidden className="absolute top-0.5 right-1 text-[10px]">🏖</span>}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-neutral-500 mt-2">
        {pickingEnd
          ? "Now click the last day of your time off (or click the same day for a one-day request)."
          : start === end
          ? `Selected: ${start}`
          : `Selected: ${start} → ${end}`}
      </p>
      <p className="sr-only">
        Use arrow keys to move by day, Page Up and Page Down to change month, Home and End for the start and end of the week. Press Enter to select.
      </p>
    </div>
  );
}
