import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import StatusBadge from "@/components/StatusBadge";
import DecisionButtons from "./DecisionButtons";
import Link from "next/link";

export default async function AllRequestsPage() {
  const profile = await requireAdmin();
  const supabase = await createServerClient();

  const { data: rows } = await supabase
    .from("leave_requests")
    .select("id, type, start_date, end_date, days_count, reason, status, decision_note, created_at, profiles:user_id(full_name, email)")
    .order("start_date", { ascending: false });

  return (
    <div>
      <TopBar profile={profile} />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">All requests</h1>
          <Link href="/admin/leave/new" className="btn-primary">+ Log leave for employee</Link>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Employee</th>
                <th>Type</th>
                <th>Dates</th>
                <th>Days</th>
                <th>Status</th>
                <th>Reason / note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r: any) => (
                <tr key={r.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 px-4 font-medium">{r.profiles?.full_name}</td>
                  <td className="capitalize">{r.type}</td>
                  <td className="whitespace-nowrap">{r.start_date} → {r.end_date}</td>
                  <td>{r.days_count}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="text-slate-500 max-w-[260px]">
                    {r.reason ?? "—"}
                    {r.decision_note && <div className="text-xs text-slate-400 mt-1">Note: {r.decision_note}</div>}
                  </td>
                  <td className="px-4">
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
        </div>
      </main>
    </div>
  );
}
