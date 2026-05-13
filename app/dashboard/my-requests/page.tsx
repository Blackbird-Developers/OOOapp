import Link from "next/link";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/balances";
import TopBar from "@/components/TopBar";
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

  return (
    <div className="bg-app min-h-screen">
      <TopBar profile={profile} />
      <ApprovalCelebration userId={profile.id} approved={myApproved} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Your leave
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">My requests</h1>
            <p className="mt-1 text-sm text-slate-500">
              Track your balance and the status of every leave request you've submitted.
            </p>
          </div>
          <Link href="/dashboard/request" className="btn-primary w-full sm:w-auto">
            Request leave
            <span aria-hidden>→</span>
          </Link>
        </header>

        <BalanceCards balance={balance} />

        <section className="card p-4 sm:p-6 mt-6">
          <div className="mb-5 flex items-baseline justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">History</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Click a rejected row to see the admin's comment.
              </p>
            </div>
            <span className="text-[11px] uppercase tracking-wider font-medium text-slate-400">
              {(requests ?? []).length} {(requests ?? []).length === 1 ? "request" : "requests"}
            </span>
          </div>
          <MyRequestsList requests={requests ?? []} />
        </section>

        <footer className="mt-10 text-center text-xs text-slate-400">
          As of {format(new Date(), "d MMMM yyyy")}
        </footer>
      </main>
    </div>
  );
}
