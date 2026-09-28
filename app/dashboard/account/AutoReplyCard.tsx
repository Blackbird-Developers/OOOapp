"use client";

import { useEffect, useState } from "react";

type State = {
  enabled: boolean;
  optedOut?: boolean;
  active?: boolean;
  activeUntil?: string | null;
};

/**
 * The employee's own say over the auto-reply.
 *
 * The app writes into their personal mailbox, which is the most intrusive
 * thing it does anywhere, so the one control that matters is the ability to
 * refuse. Phrased as an opt-out rather than an opt-in because it is on for the
 * team by default — hiding that behind a switch nobody finds would be worse
 * than saying it plainly here.
 *
 * Fetched rather than server-rendered so the account page does not wait on a
 * database round-trip for a section most people will never touch.
 */
export default function AutoReplyCard() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/auto-reply");
        const json = await res.json().catch(() => ({}));
        if (!cancelled) setState(res.ok ? json : { enabled: false });
      } catch {
        if (!cancelled) setState({ enabled: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function setOptOut(optOut: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/auto-reply", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opt_out: optOut }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Couldn't save that. Try again.");
        return;
      }
      setState((s) => (s ? { ...s, optedOut: optOut, active: optOut ? false : s.active } : s));
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  // Absent rather than empty while loading, and absent entirely when an admin
  // has the integration switched off — a card explaining a feature nobody has
  // is just noise on a page people open to change their name.
  if (!state?.enabled) return null;

  const optedOut = !!state.optedOut;

  return (
    <section className="card mt-4 p-4 sm:p-6">
      <header className="pb-5 mb-6 border-b border-neutral-200">
        <h2 className="text-xl font-semibold tracking-tight text-neutral-900">
          Email replies while you&rsquo;re away
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          When your leave starts, your Gmail answers anyone who writes to you: that you&rsquo;re out
          of office, the day you&rsquo;re back, and who to contact in the meantime — someone from
          your Hierarchy group who is in that week. It never says what kind of leave you&rsquo;re
          on, and it switches itself off when you return.
        </p>
      </header>

      {state.active && !optedOut && (
        <p className="mb-4 text-sm text-emerald-700">
          Your auto-reply is on right now
          {state.activeUntil && <> until {new Date(state.activeUntil).toLocaleDateString()}</>}.
        </p>
      )}

      <label className="flex items-start gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={!optedOut}
          disabled={busy}
          onChange={(e) => setOptOut(!e.target.checked)}
        />
        <span>
          Set an out-of-office on my leave
          <span className="block text-xs text-neutral-500">
            Untick this and your mailbox is left completely alone. Your leave, calendar and
            everything else carry on as normal.
          </span>
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-3 text-xs leading-relaxed text-rose-700">
          {error}
        </p>
      )}
    </section>
  );
}
