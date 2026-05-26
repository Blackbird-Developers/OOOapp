import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import ResetPasswordForm from "./form";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: reset } = await admin
    .from("password_resets")
    .select("expires_at, used_at, profiles:profiles!password_resets_user_id_fkey(email)")
    .eq("token", token)
    .maybeSingle();

  const invalid =
    !reset ||
    reset.used_at ||
    new Date(reset.expires_at) < new Date();

  if (invalid) {
    return (
      <div className="bg-app min-h-screen flex items-center justify-center p-4">
        <div className="card p-8 max-w-sm text-center space-y-3">
          <h1 className="text-xl font-bold tracking-tight text-brand-ink">Reset link invalid</h1>
          <p className="text-sm text-neutral-500">
            This password-reset link has expired or already been used.
          </p>
          <div className="pt-2">
            <Link href="/forgot-password" className="text-sm text-brand-ink underline hover:no-underline">
              Request a new one
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const email = (reset as any).profiles?.email as string | undefined;
  return <ResetPasswordForm token={token} email={email} />;
}
