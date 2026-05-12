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
    <div>
      <TopBar profile={profile} />
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-2xl font-bold">Public holidays</h1>
        <p className="text-sm text-slate-500">
          Holidays added here are excluded from working-day counts when employees request leave.
        </p>
        <HolidayManager initialHolidays={holidays ?? []} />
      </main>
    </div>
  );
}
