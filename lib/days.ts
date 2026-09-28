import { addDays, format, isWeekend, parseISO, startOfDay } from "date-fns";

export type HalfKind = "full" | "am" | "pm";

/** The choices a half-day dropdown offers, in the order it offers them. */
export const HALF_DAY_OPTIONS: { value: HalfKind; label: string; description?: string }[] = [
  { value: "full", label: "Full day" },
  { value: "am", label: "Morning only", description: "Counts as half a day" },
  { value: "pm", label: "Afternoon only", description: "Counts as half a day" },
];

/**
 * Count working days between two ISO dates (inclusive), excluding weekends
 * and any date in `holidayISOs`. Honors half-day flags on the start and end.
 *
 * Rules:
 *  - A full weekday counts as 1.
 *  - half_start = 'am' or 'pm' on start_date → 0.5
 *  - half_end   = 'am' or 'pm' on end_date   → 0.5
 *  - If start_date === end_date and either half is set, the day counts as 0.5.
 *  - Weekends and holidays count as 0 regardless of half flags.
 */
export function countLeaveDays(
  startISO: string,
  endISO: string,
  halfStart: HalfKind,
  halfEnd: HalfKind,
  holidayISOs: string[] = []
): number {
  const start = startOfDay(parseISO(startISO));
  const end = startOfDay(parseISO(endISO));
  if (end < start) return 0;

  const holidays = new Set(holidayISOs);
  let total = 0;
  let cursor = start;
  const endTime = end.getTime();

  while (cursor.getTime() <= endTime) {
    const iso = format(cursor, "yyyy-MM-dd");
    const isOff = isWeekend(cursor) || holidays.has(iso);
    if (!isOff) {
      const isStart = cursor.getTime() === start.getTime();
      const isEnd = cursor.getTime() === end.getTime();
      const sameDay = start.getTime() === end.getTime();

      if (sameDay) {
        total += (halfStart !== "full" || halfEnd !== "full") ? 0.5 : 1;
      } else if (isStart) {
        total += halfStart === "full" ? 1 : 0.5;
      } else if (isEnd) {
        total += halfEnd === "full" ? 1 : 0.5;
      } else {
        total += 1;
      }
    }
    cursor = addDays(cursor, 1);
  }

  return total;
}

/**
 * Days a request takes, in the unit its leave type counts in. Working-day
 * types skip weekends and holidays and honour half days. Calendar-day types
 * (maternity runs in months) count every date in the range, whole days only.
 */
export function countDaysForUnit(
  unit: "working" | "calendar",
  startISO: string,
  endISO: string,
  halfStart: HalfKind,
  halfEnd: HalfKind,
  holidayISOs: string[] = []
): number {
  if (unit === "calendar") return endISO < startISO ? 0 : datesInRange(startISO, endISO).length;
  return countLeaveDays(startISO, endISO, halfStart, halfEnd, holidayISOs);
}

/** All ISO dates in [startISO, endISO], inclusive. */
export function datesInRange(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  let cursor = startOfDay(parseISO(startISO));
  const end = startOfDay(parseISO(endISO));
  while (cursor <= end) {
    out.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 1);
  }
  return out;
}

/**
 * The company's wall clock. Vercel runs its functions in UTC, so anything that
 * has to agree with what a person in the office would call "today" — the daily
 * Slack digest, above all — has to convert explicitly rather than trust the
 * host's clock.
 *
 * `Europe/Belgrade` is Kosovo's zone in the IANA database — there is no
 * `Europe/Pristina` entry, so this is the correct spelling of Kosovo time
 * (CET in winter, CEST in summer), not a reference to a different country.
 */
export const APP_TIME_ZONE = "Europe/Belgrade";

/** Today's date in `tz`, as yyyy-MM-dd. */
export function todayISOIn(tz: string = APP_TIME_ZONE): string {
  // en-CA formats as yyyy-MM-dd, which is exactly the shape we store dates in.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Current hour (0–23) in `tz`.
 *
 * `hourCycle: "h23"` rather than `hour12: false` on purpose — some ICU builds
 * render midnight as "24" under the latter, which would read as *later* than
 * any target hour and fire a scheduled job at 00:00.
 */
export function hourNowIn(tz: string = APP_TIME_ZONE): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(
      new Date()
    )
  );
}

export function currentYear(): number {
  return new Date().getFullYear();
}

export function yearBounds(year = currentYear()): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/**
 * The UTC instant at which a given wall-clock time occurs in `tz`.
 *
 * Needed because Gmail takes the auto-reply window as epoch milliseconds,
 * while leave is stored as a bare date that means "the working day as someone
 * in the office would describe it". Getting this wrong by an hour twice a year
 * would start a responder the evening before the leave, or an hour into it.
 *
 * Works by treating the wall time as if it were UTC, measuring how far that
 * lands from the real zone offset, and correcting. The second pass covers the
 * DST boundary: the offset at the corrected instant can differ from the offset
 * at the guess, which is exactly the case a single-pass version gets wrong.
 */
export function zonedInstant(
  dateISO: string,
  hour: number,
  minute: number = 0,
  tz: string = APP_TIME_ZONE
): Date {
  const [year, month, day] = dateISO.split("-").map(Number);
  const wallAsUTC = Date.UTC(year, month - 1, day, hour, minute, 0);

  const firstPass = wallAsUTC - zoneOffsetMs(new Date(wallAsUTC), tz);
  const secondOffset = zoneOffsetMs(new Date(firstPass), tz);
  return new Date(wallAsUTC - secondOffset);
}

/** How far ahead of UTC `tz` is at `instant`, in milliseconds. */
function zoneOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // `% 24` guards the ICU builds that render midnight as hour 24 — the same
  // quirk `hourNowIn` documents, and here it would shift a whole day.
  const asUTC = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour") % 24,
    value("minute"),
    value("second")
  );
  return asUTC - instant.getTime();
}

/**
 * The first working day on or after `fromISO`, skipping weekends and the
 * supplied holidays.
 *
 * Used for the "back on ..." line in an out-of-office reply: leave that ends
 * on a Friday means the sender should expect an answer on Monday, and saying
 * Saturday would be both wrong and faintly insulting. Gives up after a
 * fortnight rather than looping, since a two-week unbroken run of holidays
 * means the holiday table is wrong, not the calendar.
 */
export function nextWorkingDay(fromISO: string, holidayISOs: string[] = []): string {
  const holidays = new Set(holidayISOs);
  let cursor = startOfDay(parseISO(fromISO));

  for (let i = 0; i < 14; i++) {
    const iso = format(cursor, "yyyy-MM-dd");
    if (!isWeekend(cursor) && !holidays.has(iso)) return iso;
    cursor = addDays(cursor, 1);
  }
  return fromISO;
}
