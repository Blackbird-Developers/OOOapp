"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Verification } from "@/lib/verification";

/**
 * Proving the company owns its email domain with a DNS TXT record, on the
 * admin's own account page. Until it's done, join links, joining by email
 * domain, integrations and more than a few people stay locked
 * (lib/verification.ts).
 *
 * DNS can take a while, or need someone else to make the change, so the
 * steps can be put away with "Skip for now" and picked up later. That choice
 * is remembered in this browser only; it changes nothing on the server.
 */

const SKIP_KEY = "blackbird-leave:domain-verification-skipped";
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
  const [skipped, setSkipped] = useState(false);
  const [changing, setChanging] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const { domain, verified, verifiedAt, record } = verification;

  // Read after mounting: the server can't know, and guessing would flash.
  useEffect(() => {
    try {
      setSkipped(localStorage.getItem(SKIP_KEY) === "1");
    } catch {
      // Storage blocked: the steps just stay open.
    }
  }, []);

  function skip(value: boolean) {
    setSkipped(value);
    setError(null);
    try {
      if (value) localStorage.setItem(SKIP_KEY, "1");
      else localStorage.removeItem(SKIP_KEY);
    } catch {
      // Not remembered; fine for this visit.
    }
  }

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

  async function saveDomain(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/organization/verify-domain", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain: newDomain }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Couldn't change the domain. Try again.");
      return;
    }
    setChanging(false);
    setNewDomain("");
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

  if (skipped) {
    return (
      <section className="card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-neutral-900 tracking-tight">Company domain</h2>
              <NotVerifiedPill />
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              Join links, joining by email domain and integrations stay locked, and you can have up to {peopleLimit}{" "}
              people, until {domain ?? "your domain"} is verified.
            </p>
          </div>
          <button type="button" className="btn-secondary shrink-0" onClick={() => skip(false)}>
            Continue verification
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-neutral-900 tracking-tight">Verify your company domain</h2>
        <NotVerifiedPill />
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
            {changing ? (
              <form onSubmit={saveDomain} className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  aria-label="Company domain"
                  className="input sm:max-w-xs"
                  placeholder="yourcompany.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button className="btn-secondary" disabled={busy || !newDomain.trim()}>
                    {busy ? "Saving…" : "Use this domain"}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setChanging(false)} disabled={busy}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setChanging(true);
                  setError(null);
                }}
                className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-neutral-600 underline hover:text-neutral-900"
              >
                Not your company&apos;s domain? Change it
              </button>
            )}
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
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" className="btn-primary" onClick={verify} disabled={busy}>
                {busy ? "Checking…" : "Verify domain"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => skip(true)} disabled={busy}>
                Skip for now
              </button>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Skipping keeps everything else working. You can come back here any time from Your account.
            </p>
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

function NotVerifiedPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full border border-neutral-500" />
      Not verified
    </span>
  );
}
