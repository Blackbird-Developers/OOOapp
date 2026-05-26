"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Field from "@/components/Field";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/password-resets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setSent(true);
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

        {sent ? (
          <div className="card p-8 space-y-4 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-brand-ink">Check your inbox</h1>
            <p className="text-sm text-neutral-500">
              If an account exists for <span className="font-medium text-neutral-900">{email}</span>, we've sent a link to reset the password. It expires in 1 hour.
            </p>
            <p className="text-xs text-neutral-500">
              Didn't get it? Check your spam folder, or{" "}
              <button
                type="button"
                className="text-brand-ink underline hover:no-underline"
                onClick={() => setSent(false)}
              >
                try a different email
              </button>
              .
            </p>
            <div className="pt-2">
              <Link href="/login" className="text-sm text-neutral-500 hover:text-neutral-900">
                Back to sign in
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="card p-8 space-y-5">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-brand-ink">Reset your password</h1>
              <p className="text-sm text-neutral-500 mt-1">
                Enter your email and we'll send you a link to choose a new one.
              </p>
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

            <button className="btn-primary w-full" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </button>

            <p className="text-xs text-neutral-500 text-center pt-2">
              Remembered it?{" "}
              <Link href="/login" className="text-brand-ink underline hover:no-underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
