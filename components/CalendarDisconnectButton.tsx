"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Dialog from "@/components/Dialog";

/**
 * Stop putting leave in people's calendars.
 *
 * Entries already filed stay where they are, and the dialog says so. Silently
 * mass-cancelling every future booking across the company off one click would
 * be a far bigger action than the button appears to offer — and the leave
 * itself hasn't changed, only the app's willingness to keep announcing it.
 */
export default function CalendarDisconnectButton() {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/calendar", { method: "DELETE" });
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
        title="Disconnect calendars?"
        description={
          <>
            New approvals stop producing calendar entries, and everyone&rsquo;s subscription link
            stops working immediately.{" "}
            <strong className="font-medium text-neutral-800">
              Entries already in people&rsquo;s calendars are left alone
            </strong>{" "}
            — they&rsquo;ll need removing by hand if you want them gone.
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
