import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { loadHolidayBook } from "@/lib/holiday-calendars";
import { presetLabel, presetKeyForCountry, presetOptions } from "@/lib/holiday-presets";
import { todayISOIn } from "@/lib/days";
import LegacyHolidayList from "./LegacyHolidayList";
import CalendarManager, { type CalendarCard, type Person } from "./CalendarManager";

export default async function HolidaysPage() {
  const admin = await requireAdmin();
  const supabase = await createServerClient();
  const [book, { data: profiles }, { data: org }] = await Promise.all([
    loadHolidayBook(supabase, admin.organization_id),
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
    supabase.from("organizations").select("country").eq("id", admin.organization_id).maybeSingle(),
  ]);

  const header = (
    <header className="mb-6">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Public holidays</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Make a holiday calendar for each country your team works in, then add the people it applies to. Their
        holidays don&apos;t count as leave, and anyone you haven&apos;t added to a calendar follows the default one.
      </p>
    </header>
  );

  if (!book.ready) {
    const { data: holidays } = await supabase.from("public_holidays").select("id, date, name").order("date");
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {header}
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Holiday calendars by country aren&apos;t set up yet. Run{" "}
          <code>supabase/migrations/020_holiday_calendars.sql</code> in the Supabase SQL editor, then reload. Until
          then this one list applies to everyone.
        </div>
        <LegacyHolidayList initialHolidays={holidays ?? []} />
      </main>
    );
  }

  const today = todayISOIn();
  const year = Number(today.slice(0, 4));
  const people: Person[] = (profiles ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    memberOf: book.memberOf.get(p.id) ?? null,
  }));

  const calendars: CalendarCard[] = book.calendars.map((c) => {
    const holidays = book.byCalendar.get(c.id) ?? [];
    const thisYear = holidays.filter((h) => h.date.startsWith(`${year}-`));
    const next = holidays.find((h) => h.date >= today) ?? null;
    return {
      id: c.id,
      name: c.name,
      isDefault: c.isDefault,
      country: c.preset ? presetLabel(c.preset) : null,
      thisYear: thisYear.length,
      year,
      next,
      // A year with nothing in it yet, worth a nudge.
      missingYears: [year, year + 1].filter((y) => !holidays.some((h) => h.date.startsWith(`${y}-`))),
      members: people.filter((p) => p.memberOf === c.id),
    };
  });

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {header}
      <CalendarManager
        calendars={calendars}
        people={people}
        followingDefault={people.filter((p) => p.memberOf === null || !book.byCalendar.has(p.memberOf))}
        countries={presetOptions()}
        suggestedCountry={presetKeyForCountry(org?.country) ?? org?.country ?? null}
      />
    </main>
  );
}
