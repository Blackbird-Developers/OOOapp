"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Dialog from "@/components/Dialog";

/**
 * Turn the digest off and forget the bot token.
 *
 * Behind a confirm because it destroys a credential: the token can't be shown
 * again, so reconnecting means fetching a fresh one from Slack. The wording
 * says that out loud rather than leaving the admin to discover it.
 */
export default function SlackDisconnectButton({ envVarsPresent }: { envVarsPresent: boolean }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/slack", { method: "DELETE" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json.error || "Couldn't disconnect. Try again.");
        return;
      }

      setAsking(false);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-rose-700 transition hover:text-rose-800"
        onClick={() => setAsking(true)}
      >
        Disconnect
      </button>

      <Dialog
        open={asking}
        onClose={() => (busy ? undefined : setAsking(false))}
        title="Disconnect Slack?"
        description={
          <>
            The daily digest stops immediately and the stored bot token is deleted. Reconnecting
            means pasting a token again — this one can&rsquo;t be shown back to you.
            {envVarsPresent && (
              <>
                {" "}
                <strong className="font-medium text-neutral-800">
                  SLACK_BOT_TOKEN is also set in this deployment&rsquo;s environment; disconnecting
                  here overrides it, so the digest stays off until you reconnect.
                </strong>
              </>
            )}
          </>
        }
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setAsking(false)}
              disabled={busy}
            >
              Keep it connected
            </button>
            <button type="button" className="btn-danger" onClick={disconnect} disabled={busy}>
              {busy ? "Disconnecting…" : "Disconnect"}
            </button>
          </>
        }
      >
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
      </Dialog>
    </>
  );
}
