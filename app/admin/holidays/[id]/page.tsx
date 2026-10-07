import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { loadHolidayBook } from "@/lib/holiday-calendars";
import { presetLabel, presetOptions } from "@/lib/holiday-presets";
import { todayISOIn } from "@/lib/days";
import CalendarEditor from "./CalendarEditor";

export default async function EditHolidayCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; warning?: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const { year: yearParam, warning } = await searchParams;
  const supabase = await createServerClient();

  const book = await loadHolidayBook(supabase, admin.organization_id);
  if (!book.ready) redirect("/admin/holidays");
  const calendar = book.calendars.find((c) => c.id === id);
  if (!calendar) redirect("/admin/holidays");

  const { data: rows } = await supabase
    .from("public_holidays")
    .select("id, date, name")
    .eq("calendar_id", id)
    .order("date")
    .limit(5000);
  const holidays = rows ?? [];

  const thisYear = Number(todayISOIn().slice(0, 4));
  const years = [
    ...new Set([...holidays.map((h) => Number(h.date.slice(0, 4))), thisYear, thisYear + 1, thisYear + 2]),
  ].sort((a, b) => a - b);
  const requested = Number(yearParam);
  const year = years.includes(requested) ? requested : thisYear;

  const { data: profiles } = await supabase.from("profiles").select("id");
  const following = (profiles ?? []).filter((p) => book.calendarFor(p.id) === id).length;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <Link
        href="/admin/holidays"
        className="inline-flex min-h-11 items-center gap-1 px-2 -mx-2 mb-3 text-xs font-medium text-neutral-500 transition hover:text-neutral-900"
      >
        ← Back to public holidays
      </Link>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">{calendar.name}</h1>
          {calendar.isDefault && (
            <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-800">
              Default
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {following === 0
            ? "Nobody follows this calendar yet. Add people from the public holidays page."
            : `${following} ${following === 1 ? "person follows" : "people follow"} this calendar${
                calendar.isDefault ? ", including everyone not added to another one" : ""
              }. Their holidays here don't count as leave days.`}
        </p>
      </header>

      <CalendarEditor
        calendar={{
          id: calendar.id,
          name: calendar.name,
          preset: calendar.preset,
          country: calendar.preset ? presetLabel(calendar.preset) : null,
        }}
        holidays={holidays}
        years={years}
        year={year}
        countries={presetOptions()}
        warning={warning ?? null}
      />
    </main>
  );
}
