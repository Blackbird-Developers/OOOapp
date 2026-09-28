"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Dialog from "@/components/Dialog";

/**
 * Stop answering mail on people's behalf.
 *
 * Takes down the replies that are already running, which is the opposite of
 * what Disconnect does for calendars — and deliberately so. A calendar entry
 * is a record of a day off that really is happening; a responder is the app
 * speaking in somebody's voice to everyone who writes in. Leaving those up
 * after switching the feature off would make the button a lie.
 */
export default function AutoReplyDisconnectButton({ active }: { active: number }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/auto-reply", { method: "DELETE" });
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
        title="Stop auto-replying?"
        description={
          <>
            New approvals stop setting anyone&rsquo;s out-of-office.{" "}
            {active > 0 ? (
              <>
                <strong className="font-medium text-neutral-800">
                  The {active} auto-repl{active === 1 ? "y" : "ies"} running right now{" "}
                  {active === 1 ? "is" : "are"} switched off too
                </strong>
                , so those mailboxes go quiet immediately.
              </>
            ) : (
              <>Nobody is auto-replying at the moment, so nothing changes today.</>
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
