import { addDays, format, isWeekend, parseISO, startOfDay } from "date-fns";

export type HalfKind = "full" | "am" | "pm";

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

export function currentYear(): number {
  return new Date().getFullYear();
}

export function yearBounds(year = currentYear()): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}
