import type { SupabaseClient } from "@supabase/supabase-js";
import type { HalfKind } from "@/lib/days";
import { loadHolidayBook } from "@/lib/holiday-calendars";

export type PersonOff = {
  userId: string;
  name: string;
  /**
   * How much of the day this person is away for.
   *  'full' — out all day
   *  'am'   — out in the morning only (matches "Morning only (½)" in the request form)
   *  'pm'   — out in the afternoon only
   */
  portion: HalfKind;
};

/** Some of the team off for a public holiday in their calendar, while others work. */
export type HolidayOff = {
  /** The holiday, e.g. "Independence Day". */
  name: string;
  /** The holiday calendar it comes from, e.g. "Kosovo". */
  calendar: string;
  /** Who follows that calendar, by name. */
  people: string[];
};

export type DayAvailability = {
  dateISO: string;
  /** On leave, minus anyone already off for a holiday below. */
  people: PersonOff[];
  /** Set when the day is a public holiday for everyone: the office is closed. */
  holiday: { date: string; name: string } | null;
  /** Holidays that only part of the team has. Empty when `holiday` is set. */
  holidaysOff: HolidayOff[];
};

/**
 * Who is on approved leave on `dateISO`, plus whose public holiday it is.
 * With one holiday calendar that's everyone or nobody; with several (Kosovo
 * and Ireland, say) it can be a day off for some of the team only.
 *
 * Deliberately returns no leave *type*: the Slack digest is company-wide and
 * sick leave is health data, so nothing downstream can leak it by accident.
 * The admin Who's off page reads `leave_requests` directly when it needs the
 * type.
 *
 * Pass a service-role client when calling from cron — RLS on `leave_requests`
 * only exposes approved rows to signed-in users, and cron has no session.
 */
export async function getDayAvailability(
  supabase: SupabaseClient,
  orgId: string,
  dateISO: string
): Promise<DayAvailability> {
  const [{ data: leaveRows }, book, { data: profiles }] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("user_id, start_date, end_date, half_start, half_end, profiles:user_id(full_name)")
      .eq("organization_id", orgId)
      .eq("status", "approved")
      .lte("start_date", dateISO)
      .gte("end_date", dateISO),
    loadHolidayBook(supabase, orgId, { from: dateISO, to: dateISO }),
    supabase.from("profiles").select("id, full_name").eq("organization_id", orgId),
  ]);

  // Group the team by the holiday they have today, if any. Before migration
  // 020 there's one list for everyone, so this is all or nobody, as it was.
  const team = (profiles ?? []) as { id: string; full_name: string }[];
  const holidayOf = (userId: string) => book.holidaysFor(userId)[0] ?? null;
  const offForHoliday = team.filter((p) => holidayOf(p.id));
  if (team.length > 0 && offForHoliday.length === team.length) {
    const names = [...new Set(team.map((p) => holidayOf(p.id)!.name))];
    return { dateISO, people: [], holiday: { date: dateISO, name: names.join(" / ") }, holidaysOff: [] };
  }
  const holidaysOff: HolidayOff[] = [];
  for (const calendar of book.calendars) {
    const followers = offForHoliday.filter((p) => book.calendarFor(p.id) === calendar.id);
    if (followers.length === 0) continue;
    holidaysOff.push({
      name: holidayOf(followers[0].id)!.name,
      calendar: calendar.name,
      people: followers.map((p) => p.full_name).sort((a, b) => a.localeCompare(b)),
    });
  }
  const onHoliday = new Set(offForHoliday.map((p) => p.id));

  // One entry per person: someone can hold two overlapping requests (a morning
  // half from one, an afternoon half from another). Merging different portions
  // means the whole day is covered, so it collapses to 'full'.
  const byUser = new Map<string, PersonOff>();
  for (const row of (leaveRows ?? []) as any[]) {
    if (onHoliday.has(row.user_id)) continue;
    const portion = portionOnDate(dateISO, row);
    const existing = byUser.get(row.user_id);
    byUser.set(row.user_id, {
      userId: row.user_id,
      name: row.profiles?.full_name ?? "Employee",
      portion: existing && existing.portion !== portion ? "full" : portion,
    });
  }

  const people = Array.from(byUser.values()).sort((a, b) => a.name.localeCompare(b.name));

  return { dateISO, people, holiday: null, holidaysOff };
}

/** Which part of `dateISO` a single leave request covers. */
function portionOnDate(
  dateISO: string,
  row: { start_date: string; end_date: string; half_start: HalfKind; half_end: HalfKind }
): HalfKind {
  const isStart = dateISO === row.start_date;
  const isEnd = dateISO === row.end_date;

  // Single-day request. Both forms write half_end = half_start in this case,
  // but fall back to half_end so a row written by hand still reads correctly.
  if (isStart && isEnd) {
    if (row.half_start !== "full") return row.half_start;
    if (row.half_end !== "full") return row.half_end;
    return "full";
  }
  if (isStart) return row.half_start;
  if (isEnd) return row.half_end;
  return "full"; // a day in the middle of the range
}
