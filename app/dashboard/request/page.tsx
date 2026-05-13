import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/balances";
import TopBar from "@/components/TopBar";
import BalanceCards from "@/components/BalanceCards";
import RequestLeaveForm from "../RequestLeaveForm";

export default async function RequestLeavePage() {
  const profile = await requireUser();
  const supabase = await createServerClient();

  const [balance, { data: holidays }] = await Promise.all([
    getBalance(profile.id),
    supabase.from("public_holidays").select("date, name").order("date"),
  ]);

  return (
    <div>
      <TopBar profile={profile} />
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <Link href="/dashboard" className="text-sm text-brand-accent hover:underline">
          ← Back to dashboard
        </Link>

        <BalanceCards balance={balance} />

        <section className="card p-6">
          <h1 className="text-2xl font-semibold mb-1">Request leave</h1>
          <p className="text-sm text-slate-500 mb-6">
            Pick the dates you'll be off on the calendar, then choose the leave type and add a reason.
          </p>
          <RequestLeaveForm holidays={holidays ?? []} balance={balance} />
        </section>
      </main>
    </div>
  );
}
