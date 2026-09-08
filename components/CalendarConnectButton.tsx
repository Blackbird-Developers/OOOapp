"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Switch the calendar integration on.
 *
 * A single button rather than a form, because unlike Slack there is nothing to
 * paste: no bot token, no cloud project, no OAuth handshake. The whole feature
 * rides on the iCalendar format and the mail transport the app already uses.
 */
export default function CalendarConnectButton({ emailConfigured }: { emailConfigured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/calendar", { method: "POST" });
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
        <button type="button" onClick={connect} className="btn-primary px-4 text-sm" disabled={busy}>
          {busy ? "Switching on…" : "Connect"}
        </button>
        <p className="text-xs text-neutral-500">
          Applies to leave approved from now on. Existing bookings aren&rsquo;t back-filled.
        </p>
      </div>

      {!emailConfigured && (
        <p className="text-xs leading-relaxed text-amber-700">
          This deployment has no <code>RESEND_API_KEY</code>, so invitation emails can&rsquo;t be
          sent. Subscription links will still work.
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
