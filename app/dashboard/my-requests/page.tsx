import { requireUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/balances";
import TopBar from "@/components/TopBar";
import BalanceCards from "@/components/BalanceCards";
import MyRequestsList from "../MyRequestsList";

export default async function MyRequestsPage() {
  const profile = await requireUser();
  const supabase = await createServerClient();

  const [balance, { data: requests }] = await Promise.all([
    getBalance(profile.id),
    supabase
      .from("leave_requests")
      .select("id, type, start_date, end_date, days_count, status, decision_note, reason, created_at")
      .eq("user_id", profile.id)
      .order("start_date", { ascending: false }),
  ]);

  return (
    <div>
      <TopBar profile={profile} />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <BalanceCards balance={balance} />

        <section className="card p-6">
          <h2 className="text-lg font-semibold mb-4">My requests</h2>
          <MyRequestsList requests={requests ?? []} />
        </section>
      </main>
    </div>
  );
}
