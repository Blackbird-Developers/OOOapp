import type { SupabaseClient } from "@supabase/supabase-js";
import type { HalfKind } from "@/lib/days";

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

export type DayAvailability = {
  dateISO: string;
  people: PersonOff[];
  holiday: { date: string; name: string } | null;
};

/**
 * Who is on approved leave on `dateISO`, plus whether that date is a public
 * holiday.
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
  dateISO: string
): Promise<DayAvailability> {
  const [{ data: leaveRows }, { data: holidayRows }] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("user_id, start_date, end_date, half_start, half_end, profiles:user_id(full_name)")
      .eq("status", "approved")
      .lte("start_date", dateISO)
      .gte("end_date", dateISO),
    supabase.from("public_holidays").select("date, name").eq("date", dateISO).limit(1),
  ]);

  // One entry per person: someone can hold two overlapping requests (a morning
  // half from one, an afternoon half from another). Merging different portions
  // means the whole day is covered, so it collapses to 'full'.
  const byUser = new Map<string, PersonOff>();
  for (const row of (leaveRows ?? []) as any[]) {
    const portion = portionOnDate(dateISO, row);
    const existing = byUser.get(row.user_id);
    byUser.set(row.user_id, {
      userId: row.user_id,
      name: row.profiles?.full_name ?? "Employee",
      portion: existing && existing.portion !== portion ? "full" : portion,
    });
  }

  const people = Array.from(byUser.values()).sort((a, b) => a.name.localeCompare(b.name));

  return { dateISO, people, holiday: holidayRows?.[0] ?? null };
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
