import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/balances";
import BalanceCards from "@/components/BalanceCards";
import ApprovalCelebration from "@/components/ApprovalCelebration";
import MyRequestsList from "../MyRequestsList";

export default async function MyRequestsPage() {
  const profile = await requireUser();
  const supabase = await createServerClient();
  const sinceISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [balance, { data: requests }] = await Promise.all([
    getBalance(profile.id),
    supabase
      .from("leave_requests")
      .select("id, type, start_date, end_date, days_count, status, decision_note, reason, created_at, decided_at")
      .eq("user_id", profile.id)
      .order("start_date", { ascending: false }),
  ]);

  const myApproved = (requests ?? [])
    .filter((r) => r.status === "approved" && r.decided_at && r.decided_at >= sinceISO)
    .map((r) => ({
      id: r.id,
      type: r.type as "annual" | "sick",
      start_date: r.start_date,
      end_date: r.end_date,
      days_count: r.days_count,
    }));

  const count = (requests ?? []).length;

  return (
    <>
      <ApprovalCelebration userId={profile.id} approved={myApproved} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">My requests</h1>
          <Link href="/dashboard/request" className="btn-primary w-full sm:w-auto">
            Request leave
            <span aria-hidden>→</span>
          </Link>
        </header>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-5 mb-5 border-b border-slate-200">
          <BalanceCards balance={balance} />
          <span className="text-[11px] uppercase tracking-wider font-medium text-slate-400">
            {count} {count === 1 ? "request" : "requests"}
          </span>
        </div>

        <MyRequestsList requests={requests ?? []} />
      </main>
    </>
  );
}
