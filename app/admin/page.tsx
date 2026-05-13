import Link from "next/link";
import { format } from "date-fns";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { yearBounds } from "@/lib/days";
import LeaveCalendar from "@/components/LeaveCalendar";
import StatusBadge from "@/components/StatusBadge";
import DecisionButtons from "./requests/DecisionButtons";

export default async function AdminHomePage() {
  await requireAdmin();
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
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Overview</h1>
            <p className="mt-1 text-sm text-slate-500">
              {format(new Date(), "EEEE, d MMMM yyyy")} · {pending?.length ?? 0} pending request{(pending?.length ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
          <Link href="/admin/leave/new" className="btn-primary w-full sm:w-auto">
            Log leave for employee
            <span aria-hidden>→</span>
          </Link>
        </header>

        <section className="card p-4 sm:p-6">
          <div className="mb-5 flex items-baseline justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">Team calendar</h2>
              <p className="text-xs text-slate-500 mt-0.5">Approved and pending leave across the team</p>
            </div>
          </div>
          <LeaveCalendar events={events} holidays={holidays ?? []} />
        </section>

        <section className="card p-4 sm:p-6 mt-6">
          <div className="mb-5 flex items-baseline justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">Pending requests</h2>
              <p className="text-xs text-slate-500 mt-0.5">Approve or reject leave from your team</p>
            </div>
            <Link
              className="text-xs font-medium text-slate-500 hover:text-slate-900 transition"
              href="/admin/requests"
            >
              All requests →
            </Link>
          </div>
          {(!pending || pending.length === 0) ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-6 py-10 text-center">
              <p className="text-sm text-slate-500">No pending requests.</p>
              <p className="text-xs text-slate-400 mt-1">You're all caught up.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/60 text-slate-500 border-b border-slate-200">
                      <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Employee</th>
                      <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Type</th>
                      <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Dates</th>
                      <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Days</th>
                      <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Reason</th>
                      <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Status</th>
                      <th className="py-3 px-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((r: any) => (
                      <tr key={r.id} className="border-b border-slate-100 last:border-b-0 align-top">
                        <td className="py-3 px-4 font-medium text-slate-900">{r.profiles?.full_name}</td>
                        <td className="py-3 px-4 capitalize text-slate-700">{r.type}</td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-700">{r.start_date} <span className="text-slate-400">→</span> {r.end_date}</td>
                        <td className="py-3 px-4 text-slate-700">{r.days_count}</td>
                        <td className="py-3 px-4 max-w-[220px]">{r.reason ?? <span className="text-slate-300">No reason given</span>}</td>
                        <td className="py-3 px-4"><StatusBadge status={r.status} /></td>
                        <td className="py-3 px-4"><DecisionButtons id={r.id} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden space-y-2">
                {pending.map((r: any) => (
                  <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 truncate">{r.profiles?.full_name}</div>
                        <div className="text-xs text-slate-500 capitalize mt-0.5">{r.type} leave · {r.days_count} day{r.days_count === 1 ? "" : "s"}</div>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="text-sm text-slate-700 tabular-nums mb-2">
                      {r.start_date} <span className="text-slate-400">→</span> {r.end_date}
                    </div>
                    {r.reason && <div className="text-sm text-slate-600 mb-3">{r.reason}</div>}
                    <DecisionButtons id={r.id} />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
  );
}
