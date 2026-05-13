import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import HolidayManager from "./HolidayManager";

export default async function HolidaysPage() {
  const profile = await requireAdmin();
  const supabase = await createServerClient();
  const { data: holidays } = await supabase
    .from("public_holidays")
    .select("id, date, name")
    .order("date");

  return (
    <div className="bg-app min-h-screen">
      <TopBar profile={profile} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Public holidays</h1>
          <p className="mt-1 text-sm text-slate-500">
            Excluded from working-day counts when employees request leave.
          </p>
        </header>

        <HolidayManager initialHolidays={holidays ?? []} />
      </main>
    </div>
  );
}
