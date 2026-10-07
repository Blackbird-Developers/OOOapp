"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

/**
 * One date, picked from a month grid in the same panel style as <Select>.
 * Replaces <input type="date">, whose look and behaviour differ in every
 * browser (Safari's is a bare text field with a tiny popover).
 *
 * Keyboard: Enter, Space or the arrows open it; arrows move by day and week,
 * Page Up/Down by month, Home/End to the week's ends, Enter picks, Escape closes.
 */
export type DatePickerProps = {
  /** YYYY-MM-DD, or "" when nothing is picked yet. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Dates to mark with a dot, e.g. holidays already in the calendar, with a label for each. */
  marked?: Map<string, string>;
  /** Which month to open on when nothing is picked. */
  defaultMonth?: string;
  disabled?: boolean;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
};

const GAP = 6;
const EDGE = 8;
const WEEK = { weekStartsOn: 1 as const };
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function toISO(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function parse(value: string | undefined): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

export default function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  marked,
  defaultMonth,
  disabled = false,
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const uid = useId();
  const fieldId = id ?? `${uid}field`;
  const gridId = `${uid}grid`;
  const titleId = `${uid}title`;

  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const selected = parse(value);
  const todayISO = toISO(new Date());
  const [open, setOpen] = useState(false);
  // The day keyboard focus is on; the grid shows its month.
  const [focused, setFocused] = useState<Date>(() => selected ?? parse(defaultMonth) ?? new Date());

  function openPanel() {
    if (disabled) return;
    setFocused(selected ?? parse(defaultMonth) ?? new Date());
    setOpen(true);
  }

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) fieldRef.current?.focus();
  }

  function pick(d: Date) {
    close();
    const iso = toISO(d);
    if (iso !== value) onChange(iso);
  }

  const place = useCallback(() => {
    const field = fieldRef.current;
    const panel = panelRef.current;
    if (!field || !panel) return;
    const rect = field.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const left = Math.max(EDGE, Math.min(rect.left, viewportWidth - EDGE - width));
    const below = window.innerHeight - rect.bottom - GAP - EDGE;
    const downwards = height <= below || below >= rect.top - GAP - EDGE;
    panel.style.left = `${left}px`;
    panel.style.top = `${downwards ? rect.bottom + GAP : Math.max(EDGE, rect.top - GAP - height)}px`;
    panel.dataset.side = downwards ? "bottom" : "top";
  }, []);

  useBrowserLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    // Top layer where supported, so a card's overflow or a dialog can't clip it.
    if (panel && typeof panel.showPopover === "function" && !panel.matches(":popover-open")) {
      try {
        panel.showPopover();
      } catch {
        // Already shown: positioning still applies.
      }
    }
    place();

    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, place]);

  // Keep real focus on the focused day, so screen readers follow along.
  useEffect(() => {
    if (!open) return;
    const day = gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${toISO(focused)}"]`);
    day?.focus({ preventScroll: true });
  }, [open, focused]);

  function onFieldKeyDown(e: ReactKeyboardEvent) {
    if (open) return;
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openPanel();
    }
  }

  function onGridKeyDown(e: ReactKeyboardEvent) {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => addMonths(focused, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focused, e.shiftKey ? 12 : 1),
      Home: () => startOfWeek(focused, WEEK),
      End: () => endOfWeek(focused, WEEK),
    };
    if (moves[e.key]) {
      e.preventDefault();
      setFocused(moves[e.key]());
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(focused);
      return;
    }
    if (e.key === "Escape") {
      // Also keeps a surrounding <dialog> from closing.
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  const monthStart = startOfMonth(focused);
  const gridStart = startOfWeek(monthStart, WEEK);
  const gridEnd = endOfWeek(endOfMonth(focused), WEEK);
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const focusedISO = toISO(focused);
  const markedHere = marked?.get(value);

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (open && !rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={fieldRef}
        id={fieldId}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? gridId : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={onFieldKeyDown}
        className="input group flex cursor-pointer items-center gap-2.5 text-left hover:border-neutral-300 aria-expanded:border-neutral-400 aria-expanded:ring-2 aria-expanded:ring-brand-ink/10 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden className="shrink-0 text-neutral-500">
          <rect x="1.75" y="2.75" width="10.5" height="9.5" rx="1.75" />
          <line x1="1.75" y1="5.75" x2="12.25" y2="5.75" />
          <line x1="4.5" y1="1.25" x2="4.5" y2="3.75" />
          <line x1="9.5" y1="1.25" x2="9.5" y2="3.75" />
        </svg>
        <span className={`min-w-0 flex-1 truncate tabular-nums ${selected ? "" : "text-neutral-500"}`}>
          {selected ? format(selected, "EEE d MMM yyyy") : placeholder}
        </span>
        {markedHere && <span className="sr-only">, already {markedHere}</span>}
      </button>

      {open && (
        <div
          ref={panelRef}
          popover="manual"
          role="dialog"
          aria-labelledby={titleId}
          // Clicking the panel must not blur the day buttons and close it.
          onMouseDown={(e) => e.preventDefault()}
          className="select-panel menu-in fixed inset-auto m-0 h-auto w-[18.5rem] max-w-[calc(100vw-16px)] overflow-hidden rounded-xl border border-neutral-200 bg-white p-3 text-neutral-900 shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Previous month"
              onClick={() => setFocused(addMonths(focused, -1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="7.5,2.5 4,6 7.5,9.5" />
              </svg>
            </button>
            <div id={titleId} aria-live="polite" className="text-sm font-medium tracking-tight text-neutral-900">
              {format(monthStart, "MMMM yyyy")}
            </div>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Next month"
              onClick={() => setFocused(addMonths(focused, 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="4.5,2.5 8,6 4.5,9.5" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 pb-1" aria-hidden>
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                {d}
              </div>
            ))}
          </div>

          <div ref={gridRef} id={gridId} role="grid" aria-labelledby={titleId} onKeyDown={onGridKeyDown} className="grid grid-cols-7 gap-0.5">
            {days.map((d) => {
              const iso = toISO(d);
              const inMonth = d.getMonth() === monthStart.getMonth();
              const isSelected = iso === value;
              const isToday = iso === todayISO;
              const weekend = d.getDay() === 0 || d.getDay() === 6;
              const mark = marked?.get(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  role="gridcell"
                  data-day={iso}
                  tabIndex={iso === focusedISO ? 0 : -1}
                  aria-selected={isSelected}
                  aria-label={`${format(d, "EEEE d MMMM yyyy")}${mark ? `, ${mark}` : ""}`}
                  title={mark}
                  onClick={() => pick(d)}
                  className={`relative flex h-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 ${
                    isSelected
                      ? "bg-neutral-900 font-medium text-white"
                      : `hover:bg-neutral-100 ${
                          !inMonth ? "text-neutral-300" : weekend ? "text-neutral-500" : "text-neutral-800"
                        } ${isToday ? "font-semibold ring-1 ring-inset ring-neutral-300" : ""}`
                  }`}
                >
                  {d.getDate()}
                  {mark && (
                    <span
                      aria-hidden
                      className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                        isSelected ? "bg-white" : "bg-amber-500"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {marked && marked.size > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-neutral-500">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Already a holiday in this calendar
            </p>
          )}
        </div>
      )}
    </div>
  );
}
