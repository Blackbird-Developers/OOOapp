"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** The full join link, or null when it's switched off. */
  joinUrl: string | null;
  domain: string;
  domainEnabled: boolean;
  /** False for a public provider such as gmail.com, which can't be claimed. */
  domainClaimable: boolean;
};

/** The two ways in besides an invite: a shareable link, and the company's email domain. */
export default function JoiningSettings({ joinUrl, domain, domainEnabled, domainClaimable }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function update(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    const res = await fetch("/api/organization/joining", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(json.error || "Couldn't save that. Try again.");
      return;
    }
    setCopied(false);
    router.refresh();
  }

  async function copy() {
    if (!joinUrl) return;
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-neutral-900">Join link</h3>
        <p className="mt-1 text-sm text-neutral-500">
          Anyone who opens it can join as an employee. Admins get an email for each new member.
        </p>
        {joinUrl ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <input readOnly aria-label="Join link" className="input flex-1 font-mono text-xs" value={joinUrl} />
              <button type="button" className="btn-secondary" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex flex-wrap gap-x-4">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => update("new", { action: "new_link" })}
                className="inline-flex min-h-11 items-center text-xs font-medium text-neutral-600 hover:text-neutral-900 disabled:text-neutral-300"
              >
                {busy === "new" ? "Replacing…" : "Replace link"}
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => update("off", { action: "disable_link" })}
                className="inline-flex min-h-11 items-center text-xs font-medium text-rose-600 hover:text-rose-700 disabled:text-rose-300"
              >
                {busy === "off" ? "Switching off…" : "Switch off"}
              </button>
            </div>
            <p className="text-xs text-neutral-500">Replacing it stops the old link working straight away.</p>
          </div>
        ) : (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => update("new", { action: "new_link" })}
            className="btn-secondary mt-3"
          >
            {busy === "new" ? "Creating…" : "Create join link"}
          </button>
        )}
      </div>

      <div className="border-t border-neutral-100 pt-6">
        <h3 className="text-sm font-semibold text-neutral-900">Work email domain</h3>
        {domainClaimable ? (
          <>
            <p className="mt-1 text-sm text-neutral-500">
              Let anyone with an <span className="font-medium text-neutral-900">@{domain}</span> address join
              as an employee from the sign-up page, without a link.
            </p>
            <label className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-neutral-900">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={domainEnabled}
                disabled={!!busy}
                onChange={(e) => update("domain", { action: "domain", enabled: e.target.checked })}
              />
              {domainEnabled ? `On for @${domain}` : "Off"}
            </label>
          </>
        ) : (
          <p className="mt-1 text-sm text-neutral-500">
            Your own address is on {domain}, a public email provider, so it can&apos;t be used to let
            colleagues join. An admin on your company&apos;s own domain can switch this on.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
