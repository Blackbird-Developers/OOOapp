import Link from "next/link";
import { format, parseISO, startOfMonth, subMonths } from "date-fns";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { todayISOIn } from "@/lib/days";
import { getEveryonesLeaveContext } from "@/lib/leave-policies";
import { loadHolidayBook } from "@/lib/holiday-calendars";
import { requestableRules } from "@/lib/leave-rules";
import AdminLogLeaveForm, { type ActiveLeave, type Employee } from "./AdminLogLeaveForm";

export default async function NewLeaveOnBehalfPage() {
  const admin = await requireAdmin();
  const supabase = await createServerClient();
  // The calendar marks leave from a year back onwards: enough to backfill
  // missed entries without sending the whole history to the browser.
  const leaveFrom = format(startOfMonth(subMonths(parseISO(todayISOIn()), 12)), "yyyy-MM-dd");

  const [{ setup, people }, holidayBook, { data: leave }] = await Promise.all([
    getEveryonesLeaveContext(),
    loadHolidayBook(supabase, admin.organization_id),
    supabase
      .from("leave_requests")
      .select("user_id, type, status, start_date, end_date")
      .in("status", ["approved", "pending"])
      .gte("end_date", leaveFrom),
  ]);

  // Each person's template decides which types can be logged for them.
  const employees: Employee[] = people.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    policyName: p.ready ? p.policy.name : null,
    rules: requestableRules(p.policy),
    calendarId: holidayBook.calendarFor(p.id),
  }));
  const holidays = Object.fromEntries(holidayBook.byCalendar);
  const typeNames = Object.fromEntries(setup.types.map((t) => [t.key, t.name]));

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <Link
        href="/admin"
        className="inline-flex min-h-11 items-center gap-1 px-2 -mx-2 mb-3 text-xs font-medium text-neutral-500 transition hover:text-neutral-900"
      >
        ← Back to admin
      </Link>

      <section className="card p-4 sm:p-6">
        <div className="pb-5 mb-6 border-b border-neutral-200">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Log leave on behalf</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Use for sick days called in over the phone, or to backfill missed entries. Approved immediately; the employee gets an email.
          </p>
        </div>

        <AdminLogLeaveForm
          employees={employees}
          typeNames={typeNames}
          holidays={holidays}
          leave={(leave ?? []) as ActiveLeave[]}
          leaveFrom={leaveFrom}
        />
      </section>
    </main>
  );
}
