import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { holidayPreset, presetHolidays, type PresetHoliday } from "@/lib/holiday-presets";
import { isCountryCode } from "@/lib/countries";

/**
 * Holiday calendars (migration 020): named lists of public holidays, such as
 * Kosovo or Ireland, that people are added to. Anyone not added to one
 * follows the company default. Whose holidays apply decides which days a
 * leave request counts, what the calendar marks, and when someone is back.
 *
 * Migration 020 is run by hand, so every loader here works either side of
 * it. Before it runs there is one list per company, which applies to
 * everyone, exactly as it always has.
 */

export type Holiday = { date: string; name: string };

export type HolidayCalendar = {
  id: string;
  name: string;
  /** Which built-in rules fill it (lib/holiday-presets.ts), or a bare country code for Nager.Date. */
  preset: string | null;
  isDefault: boolean;
};

export type HolidayBook = {
  /** False until migration 020 has been run. */
  ready: boolean;
  calendars: HolidayCalendar[];
  defaultId: string | null;
  /**
   * Who was added to which calendar. Through a user session RLS shows an
   * employee only their own row; admins and the service role see everyone.
   */
  memberOf: Map<string, string>;
  /** Each calendar's holidays, sorted by date. */
  byCalendar: Map<string, Holiday[]>;
  /** The calendar someone follows: theirs, or the default. */
  calendarFor(userId: string): string | null;
  /** The holidays that apply to someone. */
  holidaysFor(userId: string): Holiday[];
};

/** Before migration 020 everything sits under this one key. */
const LEGACY = "legacy";

type QueryError = { code?: string; message?: string } | null;

/** True when a query failed only because migration 020 hasn't been run. */
export function isCalendarsMigrationMissing(error: QueryError): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  const aboutCalendars = /holiday_calendar|calendar_id/.test(message);
  return aboutCalendars && (error.code === "PGRST205" || error.code === "42703" || error.code === "42P01");
}

export const CALENDARS_MIGRATION_MISSING_MESSAGE =
  "Holiday calendars aren't set up yet. Run supabase/migrations/020_holiday_calendars.sql in the Supabase SQL editor first.";

/**
 * Every calendar in a company, who follows which, and their holidays.
 *
 * Works with a user-session client (RLS scopes it to the caller company) or
 * the service role, which skips RLS: `orgId` is always filtered on, so the
 * service role can't read another company. `from`/`to` narrow the holidays.
 */
export async function loadHolidayBook(
  supabase: SupabaseClient,
  orgId: string,
  range: { from?: string; to?: string } = {}
): Promise<HolidayBook> {
  const [calendarsRes, membersRes] = await Promise.all([
    supabase
      .from("holiday_calendars")
      .select("id, name, preset, is_default")
      .eq("organization_id", orgId)
      .order("created_at"),
    supabase.from("holiday_calendar_members").select("user_id, calendar_id").eq("organization_id", orgId),
  ]);

  const ready = !isCalendarsMigrationMissing(calendarsRes.error);
  if (calendarsRes.error && ready) throw new Error(`Couldn't load holiday calendars: ${calendarsRes.error.message}`);

  const rows = await readHolidays(supabase, orgId, range, ready);

  if (!ready) {
    const all = rows.map(({ date, name }) => ({ date, name }));
    return book(false, [], LEGACY, new Map(), new Map([[LEGACY, all]]));
  }

  const calendars: HolidayCalendar[] = (calendarsRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    preset: c.preset,
    isDefault: c.is_default,
  }));
  const defaultId = calendars.find((c) => c.isDefault)?.id ?? calendars[0]?.id ?? null;
  const memberOf = new Map((membersRes.data ?? []).map((m) => [m.user_id as string, m.calendar_id as string]));
  const byCalendar = new Map<string, Holiday[]>(calendars.map((c) => [c.id, []]));
  for (const row of rows) byCalendar.get(row.calendar_id!)?.push({ date: row.date, name: row.name });

  return book(true, calendars, defaultId, memberOf, byCalendar);
}

function book(
  ready: boolean,
  calendars: HolidayCalendar[],
  defaultId: string | null,
  memberOf: Map<string, string>,
  byCalendar: Map<string, Holiday[]>
): HolidayBook {
  const calendarFor = (userId: string) => {
    const own = memberOf.get(userId);
    return own && byCalendar.has(own) ? own : defaultId;
  };
  return {
    ready,
    calendars,
    defaultId,
    memberOf,
    byCalendar,
    calendarFor,
    holidaysFor: (userId) => {
      const id = calendarFor(userId);
      return id ? byCalendar.get(id) ?? [] : [];
    },
  };
}

type HolidayRow = { date: string; name: string; calendar_id?: string };

/**
 * Read in pages. Supabase caps a response at 1000 rows, and several
 * calendars over several years can pass that; a silently shortened list
 * would count a holiday as a working day.
 */
async function readHolidays(
  supabase: SupabaseClient,
  orgId: string,
  range: { from?: string; to?: string },
  withCalendar: boolean
): Promise<HolidayRow[]> {
  const PAGE = 1000;
  const rows: HolidayRow[] = [];
  for (let start = 0; ; start += PAGE) {
    let query = supabase
      .from("public_holidays")
      .select(withCalendar ? "date, name, calendar_id" : "date, name")
      .eq("organization_id", orgId)
      .order("date")
      .order("id")
      .range(start, start + PAGE - 1);
    if (range.from) query = query.gte("date", range.from);
    if (range.to) query = query.lte("date", range.to);
    const { data, error } = await query;
    if (error) throw new Error(`Couldn't load public holidays: ${error.message}`);
    rows.push(...((data ?? []) as unknown as HolidayRow[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** The signed-in person's company calendars, once per render. */
export const getHolidayBook = cache(async (): Promise<HolidayBook> => {
  const profile = await getProfile();
  if (!profile) throw new Error("Not signed in");
  return loadHolidayBook(await createServerClient(), profile.organization_id);
});

/** The holidays that apply to the signed-in person, or to someone else in their company. */
export async function getHolidaysFor(userId: string): Promise<Holiday[]> {
  return (await getHolidayBook()).holidaysFor(userId);
}

/** The dates of someone's holidays between two dates, for counting working days. */
export async function holidayDatesFor(userId: string, from: string, to: string): Promise<string[]> {
  return (await getHolidaysFor(userId)).filter((h) => h.date >= from && h.date <= to).map((h) => h.date);
}

// ---------- Filling a calendar ----------

/** A built-in preset key (XK, GB-SCT, ...) or any country code Nager.Date might cover. */
export function isPresetKey(key: string): boolean {
  return !!holidayPreset(key) || isCountryCode(key);
}

/** The years a new calendar starts with: this one and the next. */
export function startingYears(today = new Date()): number[] {
  const year = today.getUTCFullYear();
  return [year, year + 1];
}

export type FillResult =
  | { ok: true; holidays: PresetHoliday[]; source: "built-in" | "nager" }
  | { ok: false; error: string };

/**
 * A year of holidays for a preset: the built-in rules when there are some,
 * otherwise the national public holidays Nager.Date (an open data set,
 * date.nager.at) lists for that country. Nager covers about 120 countries,
 * though not Kosovo, which is built in.
 */
export async function holidaysForPreset(key: string, year: number): Promise<FillResult> {
  if (holidayPreset(key)) return { ok: true, holidays: presetHolidays(key, year), source: "built-in" };
  if (!isCountryCode(key)) return { ok: false, error: "Unknown country." };

  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${key}`, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 60 * 60 * 24 },
    });
    if (res.status === 404 || res.status === 204) {
      return { ok: false, error: "There's no holiday list for that country yet. Add its holidays by hand." };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = (await res.json()) as {
      date: string;
      localName: string;
      name: string;
      global: boolean;
      types?: string[];
    }[];
    const byDate = new Map<string, PresetHoliday>();
    for (const h of list) {
      // National days off only: regional ones and observances are left to the admin.
      if (!h.global || !(h.types ?? ["Public"]).includes("Public")) continue;
      const existing = byDate.get(h.date);
      if (existing) existing.name = `${existing.name} / ${h.name}`;
      else byDate.set(h.date, { date: h.date, name: h.name.slice(0, 100) });
    }
    return { ok: true, holidays: [...byDate.values()], source: "nager" };
  } catch (e) {
    console.warn("[holidays] Nager.Date lookup failed:", (e as Error).message);
    return { ok: false, error: "Couldn't fetch that country's holidays just now. Try again, or add them by hand." };
  }
}

/**
 * Add a year of a preset to a calendar, skipping dates it already has, so
 * filling a year twice, or after removing a holiday on purpose and adding
 * one by hand, never duplicates or overwrites anything.
 */
export async function fillCalendarYear(
  supabase: SupabaseClient,
  orgId: string,
  calendarId: string,
  preset: string,
  year: number
): Promise<{ ok: true; added: number; source: "built-in" | "nager" } | { ok: false; error: string }> {
  const found = await holidaysForPreset(preset, year);
  if (!found.ok) return found;

  const { data: existing, error: readError } = await supabase
    .from("public_holidays")
    .select("date")
    .eq("organization_id", orgId)
    .eq("calendar_id", calendarId)
    .gte("date", `${year}-01-01`)
    .lte("date", `${year}-12-31`);
  if (readError) return { ok: false, error: readError.message };
  const have = new Set((existing ?? []).map((h) => h.date as string));

  const rows = found.holidays
    .filter((h) => !have.has(h.date))
    .map((h) => ({ organization_id: orgId, calendar_id: calendarId, date: h.date, name: h.name.slice(0, 100) }));
  if (rows.length > 0) {
    const { error } = await supabase
      .from("public_holidays")
      .upsert(rows, { onConflict: "calendar_id,date", ignoreDuplicates: true });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, added: rows.length, source: found.source };
}
