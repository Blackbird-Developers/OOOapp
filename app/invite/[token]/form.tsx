"use client";

import { useState } from "react";
import Image from "next/image";
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
            <h1 className="text-2xl font-bold tracking-tight text-black">
              Welcome, {fullName.split(" ")[0]}
            </h1>
            <p className="text-sm text-neutral-500 mt-1">Set a password to finish creating your account.</p>
            <p className="text-xs text-neutral-400 mt-2">{email}</p>
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
