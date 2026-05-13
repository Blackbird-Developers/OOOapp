import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import StatusBadge from "@/components/StatusBadge";
import DecisionButtons from "./DecisionButtons";

export default async function AllRequestsPage() {
  const profile = await requireAdmin();
  const supabase = await createServerClient();

  const { data: rows } = await supabase
    .from("leave_requests")
    .select("id, type, start_date, end_date, days_count, reason, status, decision_note, created_at, profiles:user_id(full_name, email)")
    .order("start_date", { ascending: false });

  return (
    <div className="bg-app min-h-screen">
      <TopBar profile={profile} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Admin</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">All requests</h1>
            <p className="mt-1 text-sm text-slate-500">
              {(rows ?? []).length} total · most recent first
            </p>
          </div>
          <Link href="/admin/leave/new" className="btn-primary w-full sm:w-auto">
            Log leave for employee
            <span aria-hidden>→</span>
          </Link>
        </header>

        <section className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/60 text-slate-500 border-b border-slate-200">
                <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Employee</th>
                <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Type</th>
                <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Dates</th>
                <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Days</th>
                <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Status</th>
                <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Reason / note</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    No requests yet.
                  </td>
                </tr>
              ) : (rows ?? []).map((r: any) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-b-0 align-top hover:bg-slate-50/40 transition-colors">
                  <td className="py-3 px-4 font-medium text-slate-900">{r.profiles?.full_name}</td>
                  <td className="py-3 px-4 capitalize text-slate-700">{r.type}</td>
                  <td className="py-3 px-4 whitespace-nowrap text-slate-700">{r.start_date} <span className="text-slate-400">→</span> {r.end_date}</td>
                  <td className="py-3 px-4 text-slate-700">{r.days_count}</td>
                  <td className="py-3 px-4"><StatusBadge status={r.status} /></td>
                  <td className="py-3 px-4 text-slate-500 max-w-[260px]">
                    {r.reason ?? "—"}
                    {r.decision_note && (
                      <div className="text-xs text-slate-400 mt-1">
                        <span className="font-medium text-slate-500">Note:</span> {r.decision_note}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {r.status === "pending" ? (
                      <DecisionButtons id={r.id} />
                    ) : r.status === "approved" ? (
                      <DecisionButtons id={r.id} allowCancel />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
