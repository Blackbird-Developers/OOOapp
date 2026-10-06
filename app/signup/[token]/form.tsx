"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import AuthShell from "@/components/AuthShell";
import Field from "@/components/Field";
import type { PendingSignup } from "@/lib/registration";

export default function CompleteSignupForm({ token, pending }: { token: string; pending: PendingSignup }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    setError(null);

    const res = await fetch("/api/signup/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setLoading(false);
      setError(json?.error || "Something went wrong. Please try again.");
      return;
    }

    const supabase = createClient();
    await supabase.auth.signInWithPassword({ email: pending.email, password });
    // A new company's admin lands where the setup is; a new employee, on
    // their own dashboard like everyone else.
    router.push(pending.kind === "create" ? "/admin" : "/");
    router.refresh();
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit} className="card p-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-ink">
            {pending.kind === "create" ? `Create ${pending.companyName}` : `Join ${pending.companyName}`}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Hi {pending.fullName.split(" ")[0]}, set a password to finish.
          </p>
          <p className="text-xs text-neutral-500 mt-2">{pending.email}</p>
        </div>

        <Field label="Password" hint="At least 8 characters">
          {(p) => (
            <input
              {...p}
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          )}
        </Field>

        <Field label="Confirm password">
          {(p) => (
            <input
              {...p}
              type="password"
              required
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          )}
        </Field>

        {error && (
          <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}

        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Setting up…" : pending.kind === "create" ? "Create company" : "Join"}
        </button>
      </form>
    </AuthShell>
  );
}
