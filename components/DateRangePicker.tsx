"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, endOfYear, format,
  isSameMonth, isToday, isWeekend, parseISO, startOfMonth, startOfWeek, startOfYear,
} from "date-fns";

/** Someone else who is off on a given day, drawn inside that day's cell. */
export type TeamOff = {
  name: string;
  /** How the type reads mid-sentence, e.g. "annual leave". */
  type: string;
  status: "approved" | "pending";
};

export default function DateRangePicker({
  start,
  end,
  onChange,
  holidays = [],
  blocked = [],
  bookingFor,
  allowPast = false,
  teamOff,
  teamOffFrom,
}: {
  start: string; // ISO yyyy-MM-dd
  end: string;   // ISO yyyy-MM-dd
  onChange: (start: string, end: string) => void;
  holidays?: { date: string; name: string }[];
  // ISO dates the viewer already has approved/pending leave for; not selectable.
  blocked?: string[];
  // The props below are for an admin logging leave for somebody else.
  // First name of the person being booked; switches the copy to third person.
  bookingFor?: string;
  // Admins backfill missed entries, so past days stay selectable.
  allowPast?: boolean;
  // Everyone else who is off, by ISO date, so the admin sees who else is out.
  teamOff?: Map<string, TeamOff[]>;
  // Earliest ISO date `teamOff` and `blocked` cover; older months say so.
  teamOffFrom?: string;
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

  // Everyone else off at some point in the selection. Phones only show dots in
  // the grid, so this line is where the names are on every screen size.
  const alsoOff = useMemo(() => {
    if (!teamOff || end < start) return null;
    const people = new Map<string, TeamOff>();
    for (const d of eachDayOfInterval({ start: parseISO(start), end: parseISO(end) })) {
      for (const p of teamOff.get(format(d, "yyyy-MM-dd")) ?? []) {
        const seen = people.get(p.name);
        if (!seen || (seen.status === "pending" && p.status === "approved")) people.set(p.name, p);
      }
    }
    return [...people.values()];
  }, [teamOff, start, end]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // The cell that takes Tab. Paging months with the arrow buttons can leave the
  // focused day off-screen, and then no cell at all would be reachable.
  const dayISOs = days.map((d) => format(d, "yyyy-MM-dd"));
  const tabbable = dayISOs.includes(focused)
    ? focused
    : dayISOs.includes(start)
    ? start
    : format(monthStart, "yyyy-MM-dd");

  const cellRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    const el = cellRefs.current.get(focused);
    el?.focus();
  }, [focused]);

  function handlePick(iso: string) {
    if (blockedSet.has(iso)) return;
    if (!allowPast && iso < todayISO) return;
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
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          type="button"
          onClick={() => setCursor(addMonths(cursor, -1))}
          className="inline-flex h-11 w-11 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition"
          aria-label="Previous month"
        >
          ‹
        </button>
        <h3 className="flex-1 text-center text-base font-medium text-neutral-900 tracking-tight" id="date-picker-label">
          {format(cursor, "MMMM yyyy")}
        </h3>
        <button
          type="button"
          onClick={() => setCursor(addMonths(cursor, 1))}
          className="inline-flex h-11 w-11 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition"
          aria-label="Next month"
        >
          ›
        </button>
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
            const isPast = !allowPast && iso < todayISO;
            // A blocked day can't be picked, so who else is off there is moot.
            const off = isBlocked ? [] : teamOff?.get(iso) ?? [];

            let cls = "bg-white text-neutral-700 hover:bg-neutral-100";
            if (!inMonth) cls = "bg-white text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700";
            else if (weekend) cls = "bg-neutral-50 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700";
            if (inRange) cls = "bg-neutral-200 text-neutral-800 hover:bg-neutral-300";
            if (isEdge) cls = "bg-neutral-900 text-white font-semibold hover:bg-neutral-800";
            if (isPast) cls = "bg-neutral-50 text-neutral-400 cursor-not-allowed hover:bg-neutral-50";
            if (isBlocked) cls = "bg-rose-100 text-rose-700 line-through cursor-not-allowed hover:bg-rose-100";

            const disabled = isBlocked || isPast;
            const isFocused = iso === tabbable;
            const offNames = off.length > 0 ? describeTeamOff(off) : null;
            const ariaLabel = [
              format(d, "EEEE, d MMMM yyyy"),
              isBlocked
                ? bookingFor ? `${bookingFor} already has leave` : "already booked"
                : isPast ? "past" : holiday,
              offNames && `also off: ${offNames}`,
            ].filter(Boolean).join(", ");
            const title = [
              isBlocked
                ? bookingFor
                  ? `${bookingFor} already has leave on this day`
                  : "You already have leave requested for this day"
                : isPast
                ? "Past dates can't be requested"
                : holiday
                ? `🏖 ${holiday}`
                : null,
              offNames && `Also off: ${offNames}`,
            ].filter(Boolean).join("\n");

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
                onFocus={() => setFocused(iso)}
                onClick={() => {
                  setFocused(iso);
                  if (!disabled) handlePick(iso);
                }}
                className={`relative p-1 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-inset ${
                  teamOff ? "flex flex-col min-h-[44px] sm:min-h-[60px]" : "min-h-[44px] sm:min-h-[48px]"
                } ${cls}`}
                title={title || undefined}
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
                {off.length > 0 && (
                  <span aria-hidden className={`mt-auto flex flex-col gap-0.5 ${inMonth ? "" : "opacity-60"}`}>
                    {/* Phones: a dot per person, three at most. */}
                    <span className="flex gap-0.5 sm:hidden">
                      {off.slice(0, 3).map((p, i) => (
                        <span key={i} className={`h-1.5 w-1.5 rounded-full ${teamDotClass(p, isEdge)}`} />
                      ))}
                    </span>
                    {/* Wider: two first names at most, the second row counting the rest. */}
                    {off.slice(0, 2).map((p, i) => (
                      <span key={i} className="hidden sm:flex items-center gap-1">
                        <span
                          className={`flex-1 min-w-0 truncate rounded px-1 text-[10px] font-medium leading-[14px] ${teamChipClass(p, isEdge)}`}
                        >
                          {p.name.split(" ")[0]}
                        </span>
                        {i === 1 && off.length > 2 && (
                          <span className={`shrink-0 text-[10px] leading-[14px] ${isEdge ? "text-white/70" : "text-neutral-600"}`}>
                            +{off.length - 2}
                          </span>
                        )}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-neutral-500 mt-2">
        {pickingEnd
          ? bookingFor
            ? "Now click the last day off (or the same day again for a single day)."
            : "Now click the last day of your time off (or click the same day for a one-day request)."
          : (start === end ? `Selected: ${start}` : `Selected: ${start} → ${end}`) +
            (alsoOff
              ? alsoOff.length === 0
                ? " · Nobody else off"
                : ` · Also off: ${alsoOff
                    .map((p) => p.name.split(" ")[0] + (p.status === "pending" ? " (pending)" : ""))
                    .join(", ")}`
              : "")}
      </p>
      {teamOff && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
          <Legend swatch="h-2.5 w-2.5 rounded-sm bg-rose-100 ring-1 ring-inset ring-rose-300">
            {bookingFor ? `${bookingFor} already off` : "Already booked"}
          </Legend>
          {/* Swatches follow the grid: dots on phones, name chips from sm up. */}
          <Legend swatch="h-1.5 w-1.5 rounded-full bg-neutral-500 sm:h-2.5 sm:w-2.5 sm:rounded-sm sm:bg-brand-accent/40">
            Others off
          </Legend>
          <Legend swatch="h-1.5 w-1.5 rounded-full border border-neutral-500 sm:h-2.5 sm:w-2.5 sm:rounded-sm sm:border-0 sm:outline-dashed sm:outline-1 sm:-outline-offset-1 sm:outline-neutral-400">
            Pending
          </Legend>
        </div>
      )}
      {teamOffFrom && format(monthEnd, "yyyy-MM-dd") < teamOffFrom && (
        <p className="mt-2 text-xs text-neutral-500">
          Leave from before {format(parseISO(teamOffFrom), "MMMM yyyy")} isn&apos;t marked here. Saving still checks for overlaps.
        </p>
      )}
      <p className="sr-only">
        Use arrow keys to move by day, Page Up and Page Down to change month, Home and End for the start and end of the week. Press Enter to select.
      </p>
    </div>
  );
}

function describeTeamOff(off: TeamOff[]) {
  return off
    .map((p) => `${p.name} (${p.type}${p.status === "pending" ? ", pending" : ""})`)
    .join(", ");
}

// Same language as the team calendar: soft lime for approved, a dashed outline
// for pending. On a selected (dark) day both turn to white.
function teamChipClass(p: TeamOff, onDark: boolean) {
  if (p.status === "pending") {
    return `outline-dashed outline-1 -outline-offset-1 ${onDark ? "outline-white/50 text-white" : "outline-neutral-400 text-neutral-700"}`;
  }
  return onDark ? "bg-white/15 text-white" : "bg-brand-accent/40 text-neutral-800";
}

function teamDotClass(p: TeamOff, onDark: boolean) {
  if (p.status === "pending") return onDark ? "border border-white/70" : "border border-neutral-500";
  return onDark ? "bg-white/70" : "bg-neutral-500";
}

function Legend({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`shrink-0 ${swatch}`} />
      {children}
    </span>
  );
}
