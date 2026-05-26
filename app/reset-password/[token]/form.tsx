"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import Field from "@/components/Field";

export default function ResetPasswordForm({
  token,
  email,
}: {
  token: string;
  email?: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/password-resets/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoading(false);
      setError(json.error || "Could not reset password.");
      return;
    }

    // If we know the email, sign the user in directly so they land on the
    // dashboard. Otherwise show a success state and link to login.
    if (email) {
      const supabase = createClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (signInErr) {
        setDone(true);
        return;
      }
      router.push("/");
      router.refresh();
      return;
    }

    setLoading(false);
    setDone(true);
  }

  return (
    <div className="bg-app min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-8">
          <Image
            src="/blackbird-logo.svg"
            alt="Blackbird"
            width={140}
            height={24}
            priority
            className="h-6 w-auto"
          />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Leave</span>
        </div>

        {done ? (
          <div className="card p-8 space-y-4 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-brand-ink">Password updated</h1>
            <p className="text-sm text-neutral-500">You can now sign in with your new password.</p>
            <Link href="/login" className="btn-primary w-full inline-flex justify-center">
              Go to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="card p-8 space-y-5">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-brand-ink">Choose a new password</h1>
              {email && <p className="text-xs text-neutral-500 mt-2">{email}</p>}
            </div>

            <Field label="New password" hint="At least 8 characters">
              {(p) => (
                <input
                  {...p}
                  type="password"
                  required
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                />
              )}
            </Field>

            <Field label="Confirm new password">
              {(p) => (
                <input
                  {...p}
                  type="password"
                  required
                  className="input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Re-enter the password"
                />
              )}
            </Field>

            {error && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {error}
              </div>
            )}

            <button className="btn-primary w-full" disabled={loading}>
              {loading ? "Saving…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
