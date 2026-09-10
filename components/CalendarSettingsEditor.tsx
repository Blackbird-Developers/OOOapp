"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarPanel, IntegrationDetail } from "@/lib/integrations";

/**
 * The connected calendar integration's control panel.
 *
 * Two switches, because there are exactly two ways an entry reaches somebody's
 * calendar and they fail in opposite directions: an invitation is instant but
 * one-shot, a subscription is slow but self-correcting. Most teams want both,
 * which is why both default on.
 */
export default function CalendarSettingsEditor({
  details,
  settings,
}: {
  details: IntegrationDetail[];
  settings: CalendarPanel;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [sendInvites, setSendInvites] = useState(settings.sendInvites);
  const [personalFeeds, setPersonalFeeds] = useState(settings.personalFeeds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/calendar", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ send_invites: sendInvites, personal_feeds: personalFeeds }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json.error || "Couldn't save. Try again.");
        return;
      }

      setEditing(false);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {details.map((d) => (
              <div key={d.label}>
                <dt className="label">{d.label}</dt>
                <dd className="text-sm text-neutral-800">{d.value}</dd>
              </div>
            ))}
          </dl>

          {!settings.emailConfigured && settings.sendInvites && (
            <p role="alert" className="mt-4 text-xs leading-relaxed text-amber-700">
              Invitations are switched on, but this deployment has no{" "}
              <code>RESEND_API_KEY</code>, so none can be sent. Subscription feeds still work.
            </p>
          )}

          {settings.siteUrlUnset && (
            <p role="alert" className="mt-4 text-xs leading-relaxed text-amber-700">
              <code>NEXT_PUBLIC_SITE_URL</code> isn&rsquo;t set to this deployment&rsquo;s address,
              so subscription links are being handed out pointing at <code>localhost</code>. They
              won&rsquo;t work for anyone, and a calendar already subscribed to one fails quietly
              rather than reporting an error. Set it in the Vercel project settings and redeploy,
              then have anyone already subscribed take a fresh link from their account page.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setEditing(true)}
          className="-mt-2 shrink-0 inline-flex min-h-11 items-center px-2 text-xs font-medium text-neutral-600 transition hover:text-neutral-900"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="label">How entries arrive</legend>

        <Toggle checked={sendInvites} onChange={setSendInvites}>
          <span>
            Email a calendar invitation when leave is approved
            <span className="block text-xs text-neutral-500">
              Lands within seconds. Google, Outlook, Teams and Apple Mail all file it themselves.
            </span>
          </span>
        </Toggle>

        <Toggle checked={personalFeeds} onChange={setPersonalFeeds}>
          <span>
            Give everyone a private subscription link
            <span className="block text-xs text-neutral-500">
              Found on their account page. Slower to refresh, but it repairs anything a missed
              invitation left behind.
            </span>
          </span>
        </Toggle>
      </fieldset>

      {!sendInvites && !personalFeeds && (
        <p role="alert" className="text-xs leading-relaxed text-amber-700">
          With both switched off nothing reaches anyone&rsquo;s calendar. Disconnect the integration
          instead if that&rsquo;s what you want.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary px-4 text-sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn-ghost px-3 text-sm"
          onClick={() => {
            setSendInvites(settings.sendInvites);
            setPersonalFeeds(settings.personalFeeds);
            setError(null);
            setEditing(false);
          }}
          disabled={busy}
        >
          Cancel
        </button>
      </div>

      {error && (
        <p role="alert" className="text-xs leading-relaxed text-rose-700">
          {error}
        </p>
      )}
    </form>
  );
}

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-neutral-700">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  );
}
