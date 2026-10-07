"use client";

import { useState } from "react";
import Link from "next/link";
import Field from "@/components/Field";

/**
 * Joining a company through its link. The answer is "check your inbox" — the
 * email says what happens next. Creating a company is CompanyWizard.
 */
export default function SignupForm({ join }: { join: { code: string; companyName: string } }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "join", code: join.code, full_name: fullName, email }),
    });
    const json = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(json?.error || "Something went wrong. Please try again.");
      return;
    }
    setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <div className="card p-8 space-y-3" role="status">
        <h1 className="text-2xl font-bold tracking-tight text-brand-ink">Check your inbox</h1>
        <p className="text-sm text-neutral-600">
          We sent a link to <span className="font-medium text-neutral-900">{sentTo}</span>. Open it to
          set your password and finish.
        </p>
        <p className="text-xs text-neutral-500">
          The link works for 7 days. Nothing arrived? Check spam, or{" "}
          <button type="button" onClick={() => setSentTo(null)} className="font-medium underline">
            try again
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card p-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-brand-ink">Join {join.companyName}</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Book leave and see who&apos;s off, with the rest of your team.
        </p>
      </div>

      <Field label="Your name">
        {(p) => (
          <input
            {...p}
            required
            maxLength={120}
            className="input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
          />
        )}
      </Field>

      <Field label="Work email">
        {(p) => (
          <input
            {...p}
            type="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@company.com"
          />
        )}
      </Field>

      {error && (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      <button className="btn-primary w-full" disabled={loading}>
        {loading ? "Sending…" : "Continue"}
      </button>

      <p className="text-xs text-neutral-500 text-center pt-2">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-neutral-900 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
