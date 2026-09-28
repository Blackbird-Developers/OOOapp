import AuthShell, { AuthNotice } from "@/components/AuthShell";
import { createAdminClient } from "@/lib/supabase/admin";
import SignupForm from "../../signup/SignupForm";

export const dynamic = "force-dynamic";

/** A company's shareable join link. Looked up on the server by its exact code. */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const valid = /^[A-Za-z0-9_-]{16,64}$/.test(code);
  const { data: org } = valid
    ? await createAdminClient().from("organizations").select("name").eq("join_code", code).maybeSingle()
    : { data: null };

  if (!org) {
    return (
      <AuthNotice title="Join link not active">
        This link has been switched off or replaced. Ask your admin for a new one.
      </AuthNotice>
    );
  }

  return (
    <AuthShell>
      <SignupForm join={{ code, companyName: org.name }} />
    </AuthShell>
  );
}
