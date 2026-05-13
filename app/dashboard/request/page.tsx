import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/balances";
import { datesInRange } from "@/lib/days";
import TopBar from "@/components/TopBar";
import BalanceCards from "@/components/BalanceCards";
import RequestLeaveForm from "../RequestLeaveForm";

export default async function RequestLeavePage() {
  const profile = await requireUser();
  const supabase = await createServerClient();

  const [balance, { data: holidays }, { data: existing }] = await Promise.all([
    getBalance(profile.id),
    supabase.from("public_holidays").select("date, name").order("date"),
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
    <div className="bg-app min-h-screen">
      <TopBar profile={profile} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition mb-6"
        >
          ← Back to dashboard
        </Link>

        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">New request</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Request leave</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pick the dates you'll be off on the calendar, then choose the leave type and add a reason.
          </p>
        </header>

        <BalanceCards balance={balance} />

        <section className="card p-4 sm:p-6 mt-6">
          <RequestLeaveForm
            holidays={holidays ?? []}
            balance={balance}
            blockedDates={blockedDates}
          />
        </section>
      </main>
    </div>
  );
}
