"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Verification } from "@/lib/verification";

/**
 * Proving the company owns its email domain with a DNS TXT record. Until it
 * does, join links, joining by email domain, integrations and more than a
 * few people stay locked (lib/verification.ts).
 */
export default function DomainVerification({
  verification,
  peopleLimit,
}: {
  verification: Verification;
  peopleLimit: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { domain, verified, verifiedAt, record } = verification;

  async function verify() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/organization/verify-domain", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Couldn't check right now. Try again.");
      return;
    }
    router.refresh();
  }

  async function copy() {
    if (!record) return;
    await navigator.clipboard.writeText(record);
    setCopied(true);
  }

  if (verified) {
    return (
      <section className="card p-4 sm:p-6">
        <h2 className="text-base font-semibold text-neutral-900 tracking-tight">Company domain</h2>
        <p className="mt-2 flex items-center gap-2 text-sm text-neutral-700">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-900" />
          <span>
            <span className="font-medium text-neutral-900">{domain}</span> is verified
            {verifiedAt ? ` since ${new Date(verifiedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""}.
          </span>
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Nobody else can create a company on this domain. You can remove the DNS record now if you like.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-neutral-900 tracking-tight">Verify your company domain</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full border border-neutral-500" />
          Not verified
        </span>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Shows that whoever looks after your domain stands behind this company. Until it&apos;s verified, join links,
        joining by email domain and integrations are locked, and you can have up to {peopleLimit} people.
      </p>

      {!domain || !record ? (
        <p className="mt-4 text-sm text-neutral-700">
          Your company has no work email domain yet. Sign in with an admin account on your company&apos;s own domain to
          verify it.
        </p>
      ) : (
        <ol className="mt-5 space-y-5 text-sm text-neutral-700">
          <li>
            <p className="font-medium text-neutral-900">1. Open your domain&apos;s DNS settings</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              Wherever <span className="font-medium text-neutral-700">{domain}</span> is managed, such as Cloudflare,
              GoDaddy, Namecheap or Google. If someone else looks after it, send them this step and the next.
            </p>
          </li>
          <li>
            <p className="font-medium text-neutral-900">2. Add a TXT record</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-xs">
              <dt className="text-neutral-500">Type</dt>
              <dd className="font-mono text-neutral-900">TXT</dd>
              <dt className="text-neutral-500">Name / host</dt>
              <dd className="text-neutral-900">
                <span className="font-mono">@</span>{" "}
                <span className="text-neutral-500">(or leave it empty, or enter {domain})</span>
              </dd>
              <dt className="text-neutral-500">Value</dt>
              <dd className="flex min-w-0 items-center gap-2">
                <input readOnly aria-label="TXT record value" className="input min-w-0 flex-1 font-mono text-xs" value={record} />
                <button type="button" className="btn-secondary shrink-0" onClick={copy}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </dd>
            </dl>
          </li>
          <li>
            <p className="font-medium text-neutral-900">3. Check it</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              New records usually show within minutes, but can take up to an hour.
            </p>
            <button type="button" className="btn-primary mt-3" onClick={verify} disabled={busy}>
              {busy ? "Checking…" : "Verify domain"}
            </button>
          </li>
        </ol>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-rose-700">
          {error}
        </p>
      )}
    </section>
  );
}
