import { requireUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/balances";
import TopBar from "@/components/TopBar";
import RequestLeaveForm from "./RequestLeaveForm";
import StatusBadge from "@/components/StatusBadge";

export default async function DashboardPage() {
  const profile = await requireUser();
  const supabase = await createServerClient();
  const [balance, { data: requests }, { data: holidays }] = await Promise.all([
    getBalance(profile.id),
    supabase
      .from("leave_requests")
      .select("id, type, start_date, end_date, days_count, status, decision_note, created_at")
      .eq("user_id", profile.id)
      .order("start_date", { ascending: false }),
    supabase.from("public_holidays").select("date, name").order("date"),
  ]);

  return (
    <div>
      <TopBar profile={profile} />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BalanceCard
            title="Annual leave"
            allowance={balance.annual_allowance}
            used={balance.annual_used}
            pending={balance.annual_pending}
            remaining={balance.annual_remaining}
            tint="indigo"
          />
          <BalanceCard
            title="Sick leave"
            allowance={balance.sick_allowance}
            used={balance.sick_used}
            pending={balance.sick_pending}
            remaining={balance.sick_remaining}
            tint="rose"
          />
        </section>

        <section className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Request leave</h2>
          <RequestLeaveForm holidays={(holidays ?? []).map((h) => h.date)} />
        </section>

        <section className="card p-6">
          <h2 className="text-lg font-semibold mb-4">My requests</h2>
          {(!requests || requests.length === 0) ? (
            <p className="text-sm text-slate-500">No requests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2">Type</th>
                    <th>Dates</th>
                    <th>Days</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="py-2 capitalize">{r.type}</td>
                      <td>{r.start_date} → {r.end_date}</td>
                      <td>{r.days_count}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="text-slate-500">{r.decision_note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function BalanceCard({
  title, allowance, used, pending, remaining, tint,
}: {
  title: string;
  allowance: number;
  used: number;
  pending: number;
  remaining: number;
  tint: "indigo" | "rose";
}) {
  const ring = tint === "indigo" ? "ring-indigo-100 bg-indigo-50" : "ring-rose-100 bg-rose-50";
  const text = tint === "indigo" ? "text-indigo-700" : "text-rose-700";
  return (
    <div className={`card p-6 ring-2 ${ring}`}>
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className={`text-3xl font-bold ${text}`}>{remaining}</span>
      </div>
      <p className="text-xs text-slate-500 mt-1">days remaining (this year)</p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div><div className="font-semibold text-slate-700">{allowance}</div><div className="text-slate-500">Allowance</div></div>
        <div><div className="font-semibold text-slate-700">{used}</div><div className="text-slate-500">Used</div></div>
        <div><div className="font-semibold text-slate-700">{pending}</div><div className="text-slate-500">Pending</div></div>
      </div>
    </div>
  );
}
