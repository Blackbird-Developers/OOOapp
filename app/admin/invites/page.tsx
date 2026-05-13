import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import InviteForm from "./InviteForm";

export default async function InvitesPage() {
  const profile = await requireAdmin();
  const supabase = await createServerClient();
  const { data: invites } = await supabase
    .from("invites")
    .select("id, email, full_name, role, expires_at, used_at, token, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="bg-app min-h-screen">
      <TopBar profile={profile} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Admin</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Invite team members</h1>
          <p className="mt-1 text-sm text-slate-500">
            Send an invite link by email. New members set their own password on first sign-in.
          </p>
        </header>

        <section className="card p-4 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500 mb-4">New invite</h2>
          <InviteForm />
        </section>

        <section className="card p-4 sm:p-6 mt-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">Recent invites</h2>
            <span className="text-[11px] uppercase tracking-wider font-medium text-slate-400">
              {(invites ?? []).length} total
            </span>
          </div>
          {(!invites || invites.length === 0) ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-6 py-10 text-center">
              <p className="text-sm text-slate-500">No invites yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/60 text-slate-500 border-b border-slate-200">
                    <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Name</th>
                    <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Email</th>
                    <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Role</th>
                    <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((i) => {
                    const expired = !i.used_at && new Date(i.expires_at) < new Date();
                    const statusKey: "accepted" | "expired" | "pending" = i.used_at ? "accepted" : expired ? "expired" : "pending";
                    const map = {
                      accepted: { label: "Accepted", bg: "bg-emerald-50", text: "text-emerald-800", dot: "bg-emerald-500" },
                      expired:  { label: "Expired",  bg: "bg-slate-100",  text: "text-slate-600",   dot: "bg-slate-400" },
                      pending:  { label: "Pending",  bg: "bg-amber-50",   text: "text-amber-800",   dot: "bg-amber-500" },
                    }[statusKey];
                    return (
                      <tr key={i.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/40 transition-colors">
                        <td className="py-3 px-4 font-medium text-slate-900">{i.full_name}</td>
                        <td className="py-3 px-4 text-slate-500">{i.email}</td>
                        <td className="py-3 px-4 capitalize text-slate-700">{i.role}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${map.bg} ${map.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${map.dot}`} />
                            {map.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
