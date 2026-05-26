"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import Field from "@/components/Field";

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

        <form onSubmit={onSubmit} className="card p-8 space-y-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-brand-ink">Welcome back</h1>
            <p className="text-sm text-neutral-500 mt-1">Sign in to manage your leave.</p>
          </div>

          <Field label="Email">
            {(p) => (
              <input
                {...p}
                type="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@blackbird.marketing"
              />
            )}
          </Field>

          <Field label="Password">
            {(p) => (
              <input
                {...p}
                type="password"
                required
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
            )}
          </Field>

          <div className="-mt-2 text-right">
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
            >
              Forgot password?
            </Link>
          </div>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </div>
          )}

          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-xs text-neutral-500 text-center pt-2">
            No account? Ask your admin for an invite.
          </p>
        </form>
      </div>
    </div>
  );
}
