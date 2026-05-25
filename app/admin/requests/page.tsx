import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import DecisionButtons from "./DecisionButtons";

export default async function AllRequestsPage() {
  await requireAdmin();
  const supabase = await createServerClient();

  const { data: rows } = await supabase
    .from("leave_requests")
    .select("id, type, start_date, end_date, days_count, reason, status, decision_note, created_at, profiles:user_id(full_name, email)")
    .order("created_at", { ascending: false });

  const total = (rows ?? []).length;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">All requests</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {total} total, most recent first.
            </p>
          </div>
          <Link href="/admin/leave/new" className="btn-accent w-full sm:w-auto">
            Log leave for employee
            <span aria-hidden>→</span>
          </Link>
        </header>

        {total === 0 ? (
          <EmptyState
            title="No requests yet"
            description="As soon as someone books leave, every approved, pending, rejected, or cancelled request will appear here."
            action={
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <Link href="/admin/invites" className="btn-secondary">Invite a team mate</Link>
                <Link href="/admin/leave/new" className="btn-accent">
                  Log leave for someone
                  <span aria-hidden>→</span>
                </Link>
              </div>
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <section className="hidden md:block card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50/60 text-neutral-500 border-b border-neutral-200">
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
                  {(rows ?? []).map((r: any) => (
                    <tr key={r.id} className="border-b border-neutral-100 last:border-b-0 align-top hover:bg-neutral-50/40 transition-colors">
                      <td className="py-3 px-4 font-medium text-neutral-900">{r.profiles?.full_name}</td>
                      <td className="py-3 px-4 capitalize text-neutral-700">{r.type}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-neutral-700">{r.start_date} <span className="text-neutral-500">→</span> {r.end_date}</td>
                      <td className="py-3 px-4 text-neutral-700">{r.days_count}</td>
                      <td className="py-3 px-4"><StatusBadge status={r.status} /></td>
                      <td className="py-3 px-4 max-w-[260px]">
                        {r.reason ?? <span className="text-neutral-500 italic">No reason given</span>}
                        {r.decision_note && (
                          <div className="text-xs text-neutral-500 mt-1">
                            <span className="font-medium text-neutral-500">Note:</span> {r.decision_note}
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

            {/* Mobile card list */}
            <section className="md:hidden space-y-2">
              {(rows ?? []).map((r: any) => (
                <div key={r.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="font-medium text-neutral-900 truncate">{r.profiles?.full_name}</div>
                      <div className="text-xs text-neutral-500 capitalize mt-0.5">
                        {r.type} leave · {r.days_count} day{r.days_count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-sm text-neutral-700 tabular-nums mb-2">
                    {r.start_date} <span className="text-neutral-500">→</span> {r.end_date}
                  </div>
                  {r.reason && <div className="text-sm text-neutral-600 mb-1">{r.reason}</div>}
                  {r.decision_note && (
                    <div className="text-xs text-neutral-500 mt-2 pt-2 border-t border-neutral-100">
                      <span className="font-medium text-neutral-600">Note:</span> {r.decision_note}
                    </div>
                  )}
                  {(r.status === "pending" || r.status === "approved") && (
                    <div className="mt-3 pt-3 border-t border-neutral-100">
                      {r.status === "pending" ? (
                        <DecisionButtons id={r.id} />
                      ) : (
                        <DecisionButtons id={r.id} allowCancel />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </section>
          </>
        )}
      </main>
  );
}
