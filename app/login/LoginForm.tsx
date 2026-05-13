"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const redirectTo = sp.get("redirect") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(redirectTo);
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
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
            <p className="text-sm text-slate-500 mt-1">Sign in to manage your leave.</p>
          </div>

          <div>
            <label className="label">Email</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@blackbird.marketing"
            />
          </div>

          <div>
            <label className="label">Password</label>
            <input
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </div>
          )}

          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-xs text-slate-500 text-center pt-2">
            No account? Ask your admin for an invite.
          </p>
        </form>
      </div>
    </div>
  );
}
