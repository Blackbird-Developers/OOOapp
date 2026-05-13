"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function InviteAcceptForm({
  token,
  email,
  fullName,
}: {
  token: string;
  email: string;
  fullName: string;
}) {
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

    const res = await fetch("/api/invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setLoading(false);
      setError(json.error || "Something went wrong.");
      return;
    }

    const supabase = createClient();
    await supabase.auth.signInWithPassword({ email, password });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="bg-app min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-900 text-white text-sm font-semibold tracking-tight">
            BB
          </span>
          <span className="text-base font-semibold tracking-tight text-slate-900">BBM Leave</span>
        </div>

        <form onSubmit={onSubmit} className="card p-8 space-y-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Welcome, {fullName.split(" ")[0]}
            </h1>
            <p className="text-sm text-slate-500 mt-1">Set a password to finish creating your account.</p>
            <p className="text-xs text-slate-400 mt-2">{email}</p>
          </div>

          <div>
            <label className="label">Password</label>
            <input
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label className="label">Confirm password</label>
            <input
              type="password"
              required
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              placeholder="Re-enter the password"
            />
          </div>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </div>
          )}

          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
