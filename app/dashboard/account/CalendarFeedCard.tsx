"use client";

import { useEffect, useState } from "react";
import { subscribeLinks } from "@/lib/calendar-links";

/**
 * The employee's own calendar subscription link.
 *
 * The invitation email that arrives on approval is the fast path — it puts the
 * day off in the calendar within seconds. This is the durable one: subscribe
 * once and the calendar re-checks forever, which repairs anything the email
 * missed (deleted before opening, filed by a rule, or simply never accepted).
 *
 * The URL is fetched rather than rendered server-side so that merely loading
 * the account page does not mint a token for somebody who never asks for one.
 */
export default function CalendarFeedCard() {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/calendar-feed");
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setError(json.error || "Couldn't load your calendar link.");
        else setUrl(json.url ?? null);
      } catch {
        if (!cancelled) setError("Couldn't load your calendar link.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy automatically — select the link and copy it.");
    }
  }

  async function regenerate() {
    // Destructive in a quiet way: existing subscriptions do not error, they
    // just stop updating. Saying so plainly is the only protection there is.
    const ok = window.confirm(
      "Create a new link?\n\nThe current link stops working immediately, and any calendar already subscribed to it will quietly stop updating until you re-subscribe."
    );
    if (!ok) return;

    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/me/calendar-feed", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error || "Couldn't create a new link.");
      else setUrl(json.url);
    } catch {
      setError("Couldn't create a new link.");
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) {
    return <div className="h-10 w-full animate-pulse rounded-xl bg-neutral-100" aria-hidden />;
  }

  if (!url) {
    return (
      <p className="text-sm text-neutral-500">
        {error ?? "Calendar subscriptions aren't switched on for this workspace."}
      </p>
    );
  }

  const links = subscribeLinks(url);

  return (
    <div className="space-y-4">
      {/*
        Every href here is an ordinary https link back to this app, which
        redirects to the vendor after the click. Linking to webcal:// directly
        would work here and be stripped by mail clients, and having the account
        page and the emails disagree about what a subscribe button is has
        already cost one bug — see lib/calendar-links.ts.

        Outlook gets the work-or-school host, which is what a company leave
        tracker overwhelmingly lands on. Personal Outlook.com accounts are on a
        different host that cannot be detected from here, so they are named
        below rather than guessed at.
      */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <a href={links.apple} className="btn-primary px-4 text-sm">
          Apple Calendar
        </a>
        <a
          href={links.google}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary px-4 text-sm"
        >
          Google Calendar
        </a>
        <a
          href={links.outlook}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary px-4 text-sm"
        >
          Outlook / Teams
        </a>
      </div>

      <p className="text-xs leading-relaxed text-neutral-500">
        The Outlook button is for a work or school account, which is also what Teams shows. On a
        personal{" "}
        <a
          href={links.outlookPersonal}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
        >
          Outlook.com account
        </a>{" "}
        use this instead. Anywhere else, add the address below by hand.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="input font-mono text-xs sm:flex-1"
          value={url}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Your private calendar link"
        />
        <button type="button" onClick={copy} className="btn-secondary shrink-0">
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      <p className="text-xs leading-relaxed text-neutral-500">
        Treat this like a password — anyone with the link can see when you&rsquo;re off.{" "}
        <button
          type="button"
          onClick={regenerate}
          disabled={regenerating}
          className="font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900 disabled:text-neutral-400"
        >
          {regenerating ? "Creating…" : "Create a new link"}
        </button>{" "}
        if you ever share it by accident.
      </p>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-neutral-700 marker:content-none hover:text-neutral-900">
          <span className="inline-flex items-center gap-1.5">
            <svg
              className="h-3 w-3 transition-transform group-open:rotate-90"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4.5 2.5 8 6l-3.5 3.5" />
            </svg>
            Subscribing by hand
          </span>
        </summary>

        <dl className="mt-3 space-y-3 border-l border-neutral-200 pl-4 text-sm leading-relaxed">
          <div>
            <dt className="font-medium text-neutral-800">Outlook / Teams</dt>
            <dd className="text-neutral-500">
              Add calendar → <strong className="font-medium">Subscribe from web</strong> → paste →
              Import. Teams shows the same calendar as Outlook, so it appears in both.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-800">Apple Calendar</dt>
            <dd className="text-neutral-500">
              The button above does this for you. By hand: File →{" "}
              <strong className="font-medium">New Calendar Subscription</strong> → paste. Set
              auto-refresh to every hour when it asks.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-800">Google Calendar</dt>
            <dd className="text-neutral-500">
              The button above does this for you. By hand: Other calendars →{" "}
              <strong className="font-medium">From URL</strong> → paste → Add calendar. Google
              refreshes subscribed calendars on its own schedule, which can take several hours.
            </dd>
          </div>
        </dl>
      </details>

      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
