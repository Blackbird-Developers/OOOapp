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
    <div>
      <TopBar profile={profile} />
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-2xl font-bold">Invite team members</h1>

        <section className="card p-6">
          <InviteForm />
        </section>

        <section className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Recent invites</h2>
          {(!invites || invites.length === 0) ? (
            <p className="text-sm text-slate-500">No invites yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2">Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => {
                  const expired = !i.used_at && new Date(i.expires_at) < new Date();
                  const status = i.used_at ? "Accepted" : expired ? "Expired" : "Pending";
                  const tone = i.used_at ? "text-emerald-700" : expired ? "text-slate-500" : "text-amber-700";
                  return (
                    <tr key={i.id} className="border-b border-slate-100">
                      <td className="py-2">{i.full_name}</td>
                      <td className="text-slate-500">{i.email}</td>
                      <td className="capitalize">{i.role}</td>
                      <td className={tone}>{status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
