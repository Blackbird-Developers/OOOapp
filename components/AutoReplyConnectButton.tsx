"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Switch the Gmail auto-reply on.
 *
 * Refuses up front when the deployment has no service account, rather than
 * connecting and failing later. Every other integration here announces a
 * broken setup the first time it runs — a digest that never lands, an invite
 * that never arrives. This one would sit there reading "Connected" while every
 * mailbox stayed silent, and the first person to notice would be a client who
 * never got an answer.
 */
export default function AutoReplyConnectButton({
  credentialsPresent,
  groups,
  domain,
}: {
  credentialsPresent: boolean;
  groups: number;
  domain: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/auto-reply", { method: "POST" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json.error || "Couldn't switch it on. Try again.");
        return;
      }

      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 space-y-3 border-t border-neutral-200 pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={connect}
          className="btn-primary px-4 text-sm"
          disabled={busy || !credentialsPresent}
        >
          {busy ? "Switching on…" : "Connect"}
        </button>
        <p className="text-xs text-neutral-500">
          Applies to leave approved from now on. Everyone can switch it off for themselves under
          Account.
        </p>
      </div>

      {!credentialsPresent && (
        <p className="text-xs leading-relaxed text-amber-700">
          This deployment has no Google service account, so nothing can be connected yet. Set{" "}
          <code>GOOGLE_SA_CLIENT_EMAIL</code> and <code>GOOGLE_SA_PRIVATE_KEY</code> from the
          service account JSON key, and <code>GOOGLE_WORKSPACE_DOMAIN</code> so the app only ever
          acts within your own domain.
        </p>
      )}

      {credentialsPresent && !domain && (
        <p className="text-xs leading-relaxed text-amber-700">
          <code>GOOGLE_WORKSPACE_DOMAIN</code> isn&rsquo;t set, so the app won&rsquo;t refuse to act
          on an address outside your Workspace before asking Google. Setting it turns a confusing
          Google error into a clear skip.
        </p>
      )}

      {credentialsPresent && groups === 0 && (
        <p className="text-xs leading-relaxed text-amber-700">
          There are no Hierarchy groups yet, so replies can say someone is away but can&rsquo;t name
          a colleague to contact instead. Set up groups under People → Hierarchy first, or add a
          fallback address once this is connected.
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs leading-relaxed text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
