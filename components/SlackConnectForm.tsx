"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Field from "@/components/Field";

/**
 * Connect Slack without a redeploy: paste the bot token and channel, press
 * Connect, and the server checks the token with Slack before storing it.
 *
 * The token field is write-only in both directions — it is never prefilled,
 * because nothing on the server will hand it back.
 */
export default function SlackConnectForm({ initialChannel = "" }: { initialChannel?: string }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [channel, setChannel] = useState(initialChannel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/slack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bot_token: token.trim(), channel_id: channel.trim() }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json.error || "Couldn't connect to Slack. Try again.");
        return;
      }

      // Don't keep the token in component state a moment longer than the
      // request needs it.
      setToken("");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={connect} className="mt-5 space-y-4 border-t border-neutral-200 pt-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bot token" hint="OAuth & Permissions → Bot User OAuth Token.">
          {(p) => (
            <input
              {...p}
              type="password"
              className="input font-mono"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="xoxb-…"
              autoComplete="off"
              spellCheck={false}
              required
            />
          )}
        </Field>

        <Field label="Channel" hint="The channel ID, not the name — e.g. C0123456789.">
          {(p) => (
            <input
              {...p}
              className="input font-mono"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="C0123456789"
              autoComplete="off"
              spellCheck={false}
              required
            />
          )}
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="btn-primary px-4 text-sm"
          disabled={busy || !token.trim() || !channel.trim()}
        >
          {busy ? "Checking with Slack…" : "Connect"}
        </button>
        <p className="text-xs text-neutral-500">
          The token is checked with Slack before it's saved, and it's never shown again.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-xs leading-relaxed text-rose-700">
          {error}
        </p>
      )}
    </form>
  );
}
