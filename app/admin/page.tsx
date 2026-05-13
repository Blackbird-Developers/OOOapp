import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { yearBounds } from "@/lib/days";
import TopBar from "@/components/TopBar";
import LeaveCalendar from "@/components/LeaveCalendar";
import StatusBadge from "@/components/StatusBadge";
import DecisionButtons from "./requests/DecisionButtons";

export default async function AdminHomePage() {
  const profile = await requireAdmin();
  const supabase = await createServerClient();
  const { from, to } = yearBounds();

  const [{ data: pending }, { data: rangeRows }, { data: holidays }] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("id, type, start_date, end_date, days_count, reason, status, created_at, user_id, profiles:user_id(full_name, email)")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("leave_requests")
      .select("id, type, status, start_date, end_date, user_id, profiles:user_id(full_name)")
      .in("status", ["approved", "pending"])
      .gte("end_date", from)
      .lte("start_date", to),
    supabase.from("public_holidays").select("date, name").order("date"),
  ]);

  const events = (rangeRows ?? []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.profiles?.full_name ?? "Employee",
    type: r.type,
    status: r.status,
    start: r.start_date,
    end: r.end_date,
  }));

  return (
    <div>
      <TopBar profile={profile} />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <section className="card p-6">
          <LeaveCalendar events={events} holidays={holidays ?? []} />
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Pending requests</h2>
            <Link className="text-sm text-brand-accent hover:underline" href="/admin/requests">
              All requests →
            </Link>
          </div>
          {(!pending || pending.length === 0) ? (
            <p className="text-sm text-slate-500">No pending requests. 🎉</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2">Employee</th>
                    <th>Type</th>
                    <th>Dates</th>
                    <th>Days</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((r: any) => (
                    <tr key={r.id} className="border-b border-slate-100 align-top">
                      <td className="py-2 font-medium">{r.profiles?.full_name}</td>
                      <td className="capitalize">{r.type}</td>
                      <td className="whitespace-nowrap">{r.start_date} → {r.end_date}</td>
                      <td>{r.days_count}</td>
                      <td className="text-slate-500 max-w-[220px]">{r.reason ?? "—"}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td><DecisionButtons id={r.id} /></td>
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
