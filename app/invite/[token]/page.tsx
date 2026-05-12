import { createServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import InviteAcceptForm from "./form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createServerClient();

  const { data: invite } = await supabase
    .from("invites")
    .select("email, full_name, expires_at, used_at")
    .eq("token", token)
    .single();

  if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card p-8 max-w-sm text-center space-y-2">
          <h1 className="text-xl font-bold">Invite invalid</h1>
          <p className="text-sm text-slate-500">
            This invite link is expired or has already been used. Ask your admin for a new one.
          </p>
        </div>
      </div>
    );
  }

  return <InviteAcceptForm token={token} email={invite.email} fullName={invite.full_name} />;
}
