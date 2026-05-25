import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";
import InviteForm from "./InviteForm";
import DeleteInviteButton from "./DeleteInviteButton";

export default async function InvitesPage() {
  await requireAdmin();
  const supabase = await createServerClient();
  const { data: invites } = await supabase
    .from("invites")
    .select("id, email, full_name, role, expires_at, used_at, token, created_at")
    .order("created_at", { ascending: false });

  const total = (invites ?? []).length;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Invite team members</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Send an invite link. New members set their own password on first sign-in.
          </p>
        </header>

        <section className="card p-4 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-500 mb-4">New invite</h2>
          <InviteForm />
        </section>

        <section className="mt-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold text-neutral-900 tracking-tight">Recent invites</h2>
            <span className="text-[11px] uppercase tracking-wider font-medium text-neutral-500">
              {total} total
            </span>
          </div>

          {total === 0 ? (
            <EmptyState
              title="No invites sent yet"
              description="Use the form above to invite a team mate. Each invite link is good for 7 days; you can resend if it expires."
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto rounded-lg border border-neutral-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50/60 text-neutral-500 border-b border-neutral-200">
                      <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Name</th>
                      <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Email</th>
                      <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Role</th>
                      <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Status</th>
                      <th className="py-3 px-4 text-right text-[11px] font-semibold uppercase tracking-[0.08em]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invites ?? []).map((i) => (
                      <tr key={i.id} className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50/40 transition-colors">
                        <td className="py-3 px-4 font-medium text-neutral-900">{i.full_name}</td>
                        <td className="py-3 px-4 text-neutral-500">{i.email}</td>
                        <td className="py-3 px-4 capitalize text-neutral-700">{i.role}</td>
                        <td className="py-3 px-4"><InviteStatus invite={i} /></td>
                        <td className="py-3 px-4 text-right"><DeleteInviteButton id={i.id} email={i.email} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile list */}
              <ul className="sm:hidden space-y-2">
                {(invites ?? []).map((i) => (
                  <li key={i.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-neutral-900 truncate">{i.full_name}</div>
                        <div className="text-xs text-neutral-500 truncate">{i.email}</div>
                        <div className="text-xs text-neutral-500 capitalize mt-0.5">{i.role}</div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <InviteStatus invite={i} />
                        <DeleteInviteButton id={i.id} email={i.email} variant="mobile" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </main>
  );
}

function InviteStatus({ invite }: { invite: { used_at: string | null; expires_at: string } }) {
  const expired = !invite.used_at && new Date(invite.expires_at) < new Date();
  const key: "accepted" | "expired" | "pending" = invite.used_at ? "accepted" : expired ? "expired" : "pending";

  // Shares the StatusBadge palette: lime = positive outcome, rose = negative,
  // neutral with an outlined dot = waiting/in-process.
  const muted = key === "expired";
  const textCls = key === "expired" ? "text-rose-700" : "text-neutral-800";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium shrink-0 ${textCls}`}>
      {key === "pending" ? (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-transparent ring-[1.5px] ring-inset ring-neutral-500" />
      ) : key === "accepted" ? (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand-accent" />
      ) : (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-rose-500" />
      )}
      {muted ? "Expired" : key === "accepted" ? "Accepted" : "Pending"}
    </span>
  );
}
