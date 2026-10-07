import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { getLeaveSummary } from "@/lib/balances";
import { datesInRange } from "@/lib/days";
import { leaveOverview } from "@/lib/leave-rules";
import BalanceCards from "@/components/BalanceCards";
import AllLeaveTypes from "@/components/AllLeaveTypes";
import RequestLeaveForm from "../RequestLeaveForm";
import { getHolidaysFor } from "@/lib/holiday-calendars";

export default async function RequestLeavePage() {
  const profile = await requireUser();
  const supabase = await createServerClient();

  const [summary, holidays, { data: existing }] = await Promise.all([
    getLeaveSummary(profile.id),
    getHolidaysFor(profile.id),
    supabase
      .from("leave_requests")
      .select("start_date, end_date")
      .eq("user_id", profile.id)
      .in("status", ["approved", "pending"]),
  ]);

  const blockedDates = Array.from(
    new Set(
      (existing ?? []).flatMap((r: { start_date: string; end_date: string }) =>
        datesInRange(r.start_date, r.end_date)
      )
    )
  );

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <Link
        href="/dashboard"
        className="inline-flex min-h-11 items-center gap-1 px-2 -mx-2 mb-3 text-xs font-medium text-neutral-500 transition hover:text-neutral-900"
      >
        ← Back to dashboard
      </Link>

      <section className="card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between pb-5 mb-6 border-b border-neutral-200">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Request leave</h1>
          <BalanceCards balances={summary.balances}>
            <AllLeaveTypes
              entries={leaveOverview(summary.policy, summary.employment, summary.rows, summary.year, summary.todayISO)}
              year={summary.year}
            />
          </BalanceCards>
        </div>

        <RequestLeaveForm
          holidays={holidays}
          policy={summary.policy}
          employment={summary.employment}
          rows={summary.rows}
          todayISO={summary.todayISO}
          blockedDates={blockedDates}
          calendarHref={profile.role === "admin" ? "/admin" : "/dashboard"}
        />
      </section>
    </main>
  );
}
