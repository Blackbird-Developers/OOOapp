"use client";

import { useCallback, useMemo, useState } from "react";
import Dialog from "@/components/Dialog";
import { FALLBACK_COLOR, leaveColors, type LeaveColor } from "@/lib/leave-colors";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameMonth, isToday, isWeekend, parseISO, startOfMonth, startOfWeek,
} from "date-fns";

export type CalendarEvent = {
  id: string;
  userId: string;
  userName: string;
  type: string;
  /** The type's display name ("Maternity leave"); falls back to the key. */
  typeName?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  start: string;
  end: string;
  /** Days the request takes off the allowance (half days and holidays counted). */
  days?: number;
};

type Colors = Map<string, LeaveColor>;

const DEFAULT_TYPES = [
  { key: "annual", name: "Annual leave" },
  { key: "sick", name: "Sick leave" },
];

/** Leave types the inline legend names beyond annual and sick; the rest are under "View all". */
const LEGEND_EXTRA = 3;

export default function LeaveCalendar({
  events,
  holidays,
  viewerUserId,
  types = DEFAULT_TYPES,
}: {
  events: CalendarEvent[];
  holidays: { date: string; name: string }[];
  viewerUserId?: string;
  /** The leave type catalogue, in order: names the legend and assigns colours. */
  types?: { key: string; name: string }[];
}) {
  const [cursor, setCursor] = useState(new Date());
  const [openDay, setOpenDay] = useState<string | null>(null);
  const closeDay = useCallback(() => setOpenDay(null), []);
  const [legendOpen, setLegendOpen] = useState(false);
  const closeLegend = useCallback(() => setLegendOpen(false), []);

  const colors = useMemo(() => leaveColors(types, viewerUserId !== undefined), [types, viewerUserId]);

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

  // The inline legend always shows annual and sick, then whichever other
  // types are coloured on screen this month. Colleagues on the dashboard
  // aren't coloured by type, so their leave doesn't count.
  const gridFrom = format(gridStart, "yyyy-MM-dd");
  const gridTo = format(gridEnd, "yyyy-MM-dd");
  const onScreen = new Set(
    events
      .filter((ev) => ev.status === "approved" && ev.end >= gridFrom && ev.start <= gridTo)
      .filter((ev) => viewerUserId === undefined || ev.userId === viewerUserId)
      .map((ev) => ev.type)
  );
  const extraTypes = types.filter((t) => t.key !== "annual" && t.key !== "sick" && onScreen.has(t.key));
  const legendTypes = [
    ...types.filter((t) => t.key === "annual" || t.key === "sick"),
    ...extraTypes.slice(0, LEGEND_EXTRA),
  ];
  const hiddenTypes = types.length - legendTypes.length;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4">
        <button
          type="button"
          onClick={() => setCursor(addMonths(cursor, -1))}
          className="inline-flex h-11 w-11 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition"
          aria-label="Previous month"
        >
          ‹
        </button>
        <h3 className="flex-1 text-center text-base font-medium text-neutral-900 tracking-tight">
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
              <button
                type="button"
                key={iso}
                onClick={() => setOpenDay(iso)}
                aria-label={`${format(d, "EEEE d MMMM")}${holiday ? `, ${holiday}` : ""}: ${
                  dayEvents.length === 0 ? "nobody off" : `${dayEvents.length} off`
                }`}
                className={`block w-full text-left bg-white p-1 sm:p-2 transition-colors min-h-[68px] sm:min-h-[104px] hover:bg-neutral-50 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30 ${
                  weekend ? "bg-neutral-50/40" : ""
                } ${holiday ? "holiday-hatch" : ""} ${!inMonth ? "opacity-50" : ""}`}
              >
                <span className="flex items-start justify-between gap-1 mb-1 sm:mb-1.5">
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
                </span>
                {holiday && (
                  <span
                    className="mb-1 hidden truncate text-[10px] font-semibold leading-tight text-neutral-600 sm:block"
                    title={holiday}
                  >
                    {holiday}
                  </span>
                )}
                <span className="block space-y-0.5 sm:space-y-1">
                  {dayEvents.slice(0, desktopVisible).map((ev, idx) => {
                    const isPeer = viewerUserId !== undefined && ev.userId !== viewerUserId;
                    const typeName = ev.typeName ?? ev.type;
                    const label = isPeer
                      ? ev.userName.split(" ")[0]
                      : `${ev.userName.split(" ")[0]} · ${typeName.charAt(0).toUpperCase()}`;
                    const title = isPeer
                      ? `${ev.userName}: off`
                      : `${ev.userName}: ${typeName} (${ev.status})`;
                    const hideOnMobile = idx >= mobileVisible;
                    const pending = ev.status === "pending";
                    return (
                      <span
                        key={ev.id + iso}
                        className={`${hideOnMobile ? "hidden sm:flex" : "flex"} items-center gap-1 truncate rounded sm:rounded-md px-1 sm:px-1.5 py-0 sm:py-0.5 text-[9px] sm:text-[11px] font-medium leading-tight ${badgeClass(ev, isPeer, colors)} ${
                          pending ? "border border-dashed border-neutral-400" : ""
                        }`}
                        title={title}
                      >
                        <span aria-hidden className={`inline-block h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full shrink-0 ${dotClass(ev, isPeer, colors)}`} />
                        <span className="truncate">{label}</span>
                      </span>
                    );
                  })}
                  {dayEvents.length > mobileVisible && (
                    <span className="block text-[9px] text-neutral-500 px-1 sm:hidden">
                      +{dayEvents.length - mobileVisible}
                    </span>
                  )}
                  {dayEvents.length > desktopVisible && (
                    <span className="hidden sm:block text-[10px] text-neutral-500 px-1.5">
                      +{dayEvents.length - desktopVisible} more
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-xs text-neutral-500">
        {legendTypes.map((t) => (
          <Legend key={t.key} swatch={<span className={`h-2.5 w-2.5 rounded-sm ${colorOf(colors, t.key).badge}`} />}>
            {typeLabel(t.name, viewerUserId !== undefined)}
          </Legend>
        ))}
        {viewerUserId !== undefined && (
          <Legend swatch={<span className="h-2.5 w-2.5 rounded-sm bg-brand-accent/40" />}>Team mate</Legend>
        )}
        <Legend swatch={<span className="h-2.5 w-2.5 rounded-sm border border-dashed border-neutral-400 bg-transparent" />}>Pending</Legend>
        {holidays.some((h) => h.date >= gridFrom && h.date <= gridTo) && (
          <Legend swatch={<span className="holiday-hatch h-2.5 w-2.5 rounded-sm ring-1 ring-inset ring-neutral-300" />}>Holiday</Legend>
        )}
        <button
          type="button"
          onClick={() => setLegendOpen(true)}
          className="font-medium text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900 hover:decoration-neutral-500"
        >
          View all leave types{hiddenTypes > 0 ? ` (+${hiddenTypes})` : ""}
        </button>
        <span className="text-neutral-400">Click a day to see who's off.</span>
      </div>

      <LegendDialog
        open={legendOpen}
        onClose={closeLegend}
        types={types}
        colors={colors}
        forViewer={viewerUserId !== undefined}
      />

      <DayDialog
        iso={openDay}
        events={openDay ? eventsByDay.get(openDay) ?? [] : []}
        holiday={openDay ? holidayMap.get(openDay) : undefined}
        viewerUserId={viewerUserId}
        colors={colors}
        onClose={closeDay}
      />
    </div>
  );
}

/**
 * Everyone off on one day, with how long each of them is out. Colleagues on
 * the dashboard stay "off" with no leave type, same as the grid.
 */
function DayDialog({
  iso,
  events,
  holiday,
  viewerUserId,
  colors,
  onClose,
}: {
  iso: string | null;
  events: CalendarEvent[];
  holiday?: string;
  viewerUserId?: string;
  colors: Colors;
  onClose: () => void;
}) {
  const sorted = [...events].sort(
    (a, b) => Number(a.status === "pending") - Number(b.status === "pending") || a.userName.localeCompare(b.userName)
  );
  const approved = events.filter((ev) => ev.status === "approved").length;
  const summary =
    events.length === 0
      ? "Nobody is off."
      : `${approved} ${approved === 1 ? "person" : "people"} off${
          events.length > approved ? `, ${events.length - approved} pending` : ""
        }.`;

  return (
    <Dialog
      open={iso !== null}
      onClose={onClose}
      title={iso ? format(parseISO(iso), "EEEE d MMMM yyyy") : ""}
      description={holiday ? `${holiday} (public holiday). ${summary}` : summary}
      footer={
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      {sorted.length > 0 && (
        <ul className="-mx-1 max-h-[55vh] divide-y divide-neutral-100 overflow-y-auto">
          {sorted.map((ev) => {
            const isPeer = viewerUserId !== undefined && ev.userId !== viewerUserId;
            const pending = ev.status === "pending";
            return (
              <li key={ev.id} className="flex items-start justify-between gap-3 px-1 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`h-2 w-2 shrink-0 rounded-full ${dotClass(ev, isPeer, colors)}`}
                    />
                    <span className="truncate text-sm font-medium text-neutral-900">{ev.userName}</span>
                    {pending && (
                      <span className="shrink-0 rounded border border-dashed border-neutral-400 px-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-600">
                        Pending
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 pl-4 text-xs text-neutral-500">
                    {isPeer ? "Off" : ev.typeName ?? ev.type} · {rangeLabel(ev.start, ev.end)}
                  </div>
                </div>
                {ev.days !== undefined && !Number.isNaN(ev.days) && (
                  <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-neutral-900">
                    {formatDays(ev.days)}
                    <span className="block text-[11px] font-normal text-neutral-500">
                      {ev.days === 1 ? "day" : "days"}
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

function rangeLabel(start: string, end: string) {
  const s = parseISO(start);
  const e = parseISO(end);
  if (start === end) return format(s, "EEE d MMM");
  const sameYear = s.getFullYear() === e.getFullYear();
  return `${format(s, sameYear ? "d MMM" : "d MMM yyyy")} – ${format(e, sameYear ? "d MMM" : "d MMM yyyy")}`;
}

/**
 * Every leave type's colour, plus the marks that aren't types. On the
 * dashboard only your own leave is coloured by type.
 */
function LegendDialog({
  open,
  onClose,
  types,
  colors,
  forViewer,
}: {
  open: boolean;
  onClose: () => void;
  types: { key: string; name: string }[];
  colors: Colors;
  forViewer: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Calendar colours"
      description={
        forViewer
          ? "Your own leave is coloured by type. Colleagues show in lime, without their leave type."
          : "Each type of leave has its own colour."
      }
      footer={
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      <ul className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        {types.map((t) => (
          <li key={t.key} className="flex items-center gap-2.5 text-sm text-neutral-800">
            <Sample className={colorOf(colors, t.key).badge} dot={colorOf(colors, t.key).dot} />
            {t.name}
          </li>
        ))}
      </ul>
      <ul className="mt-4 space-y-2 border-t border-neutral-100 pt-4 text-sm text-neutral-800">
        {forViewer && (
          <li className="flex items-center gap-2.5">
            <Sample className="bg-brand-accent/40 text-neutral-800" dot="bg-brand-ink/40" />
            A team mate is off
          </li>
        )}
        <li className="flex items-center gap-2.5">
          <Sample className="bg-neutral-50 text-neutral-700 border border-dashed border-neutral-400" dot="bg-neutral-400" />
          Pending: requested, not approved yet
        </li>
        <li className="flex items-center gap-2.5">
          <span aria-hidden className="holiday-hatch h-4 w-10 shrink-0 rounded-md ring-1 ring-inset ring-neutral-300" />
          Public holiday, with its name on the day
        </li>
        <li className="flex items-center gap-2.5">
          <span className="inline-flex w-10 shrink-0 justify-center">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent px-1 text-[10px] font-bold text-brand-ink ring-1 ring-brand-ink/5">
              {format(new Date(), "d")}
            </span>
          </span>
          Today
        </li>
      </ul>
    </Dialog>
  );
}

/** A miniature calendar badge. */
function Sample({ className, dot }: { className: string; dot: string }) {
  return (
    <span aria-hidden className={`inline-flex h-4 w-10 shrink-0 items-center gap-1 rounded-md px-1.5 ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
    </span>
  );
}

function colorOf(colors: Colors, type: string): LeaveColor {
  return colors.get(type) ?? FALLBACK_COLOR;
}

/** "Annual leave", or "Your annual leave" on the dashboard. */
function typeLabel(name: string, forViewer: boolean) {
  return forViewer ? `Your ${name.charAt(0).toLowerCase()}${name.slice(1)}` : name;
}

function formatDays(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function badgeClass(ev: CalendarEvent, isPeer: boolean, colors: Colors) {
  if (ev.status === "pending") return "bg-neutral-50 text-neutral-700";
  // Colleagues on the dashboard: their leave type never reaches the browser.
  if (isPeer) return "bg-brand-accent/40 text-neutral-800";
  return colorOf(colors, ev.type).badge;
}

function dotClass(ev: CalendarEvent, isPeer: boolean, colors: Colors) {
  if (ev.status === "pending") return "bg-neutral-400";
  if (isPeer) return "bg-brand-ink/40";
  return colorOf(colors, ev.type).dot;
}

function Legend({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  );
}
