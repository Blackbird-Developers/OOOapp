"use client";

import { useState } from "react";

type Result = { kind: "ok"; people: number } | { kind: "error"; message: string };

/**
 * Fires today's digest into Slack on demand, so an admin can confirm the token,
 * channel and bot membership are right without waiting for the 09:00 cron.
 */
export default function SlackDigestButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function onClick() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/slack/test", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      setResult(
        res.ok
          ? { kind: "ok", people: json.people ?? 0 }
          : { kind: "error", message: json.error || "Couldn't post to Slack. Try again." }
      );
    } catch {
      setResult({ kind: "error", message: "Couldn't reach the server. Check your connection." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button type="button" className="btn-secondary" onClick={onClick} disabled={busy}>
        {busy ? "Posting…" : "Post to Slack now"}
      </button>

      {result?.kind === "ok" && (
        <p role="status" className="text-xs text-emerald-700">
          Posted to Slack ·{" "}
          {result.people === 0
            ? "nobody off today"
            : `${result.people} ${result.people === 1 ? "person" : "people"} listed`}
        </p>
      )}

      {result?.kind === "error" && (
        <p role="alert" className="max-w-xs text-xs text-rose-700 sm:text-right">
          {result.message}
        </p>
      )}
    </div>
  );
}
