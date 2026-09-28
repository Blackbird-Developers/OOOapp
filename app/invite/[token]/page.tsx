import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import InviteAcceptForm from "./form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Looked up on the server by its exact token. Invites are not readable with
  // the public anon key at all (migration 015), because that let anyone list
  // every open invite, token included.
  const { data: invite } = await createAdminClient()
    .from("invites")
    .select("email, full_name, expires_at, used_at, organizations(name)")
    .eq("token", token)
    .single();

  if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card p-8 max-w-sm text-center space-y-2">
          <h1 className="text-xl font-bold">Invite invalid</h1>
          <p className="text-sm text-neutral-500">
            This invite link is expired or has already been used. Ask your admin for a new one.
          </p>
        </div>
      </div>
    );
  }

  const org = invite.organizations as unknown as { name: string } | null;
  return (
    <InviteAcceptForm
      token={token}
      email={invite.email}
      fullName={invite.full_name}
      companyName={org?.name ?? ""}
    />
  );
}
