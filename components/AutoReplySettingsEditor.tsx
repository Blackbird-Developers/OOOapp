"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AutoReplyPanel, IntegrationDetail } from "@/lib/integrations";

type Preview = {
  sample: boolean;
  subject: string;
  bodyText: string;
  contacts: { name: string; email: string }[];
  returnDate: string;
};

/** Matches EXTRA_NOTE_MAX on the server. */
const NOTE_MAX = 280;

/**
 * The connected auto-reply integration's control panel.
 *
 * Leads with the preview rather than the settings, which is the reverse of its
 * neighbours here. Everything else on this page produces something an admin
 * can go and look at — a Slack message, a calendar entry. This produces a
 * letter sent in an employee's name, to strangers, with nobody reading it
 * first, so being able to see the exact words is the important control and the
 * three settings are the footnote.
 */
export default function AutoReplySettingsEditor({
  details,
  settings,
}: {
  details: IntegrationDetail[];
  settings: AutoReplyPanel;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [restrictToDomain, setRestrictToDomain] = useState(settings.restrictToDomain);
  const [fallbackEmail, setFallbackEmail] = useState(settings.fallbackEmail);
  const [extraNote, setExtraNote] = useState(settings.extraNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; detail: string; preview: Preview | null } | null>(
    null
  );

  /**
   * Prove the Google wiring and show the words, in one request.
   *
   * Reads the admin's own mailbox and writes nothing. That exercises every
   * piece that can be silently wrong — the key signs, the delegation is
   * authorised, the Gmail API is enabled, the scope reaches vacation settings
   * — without setting a responder on anyone to find out.
   */
  async function runCheck() {
    setChecking(true);
    setCheck(null);
    try {
      const res = await fetch("/api/integrations/auto-reply/test", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      setCheck({
        ok: !!json.ok,
        detail: json.detail || json.error || "Couldn't run the check.",
        preview: json.preview ?? null,
      });
    } catch {
      setCheck({ ok: false, detail: "Couldn't reach the server.", preview: null });
    } finally {
      setChecking(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/auto-reply", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restrict_to_domain: restrictToDomain,
          fallback_email: fallbackEmail.trim(),
          extra_note: extraNote.trim(),
        }),
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

          <Warnings settings={settings} />

          <div className="mt-5 border-t border-neutral-200 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={runCheck}
                disabled={checking}
                className="btn-secondary px-3 text-xs"
              >
                {checking ? "Checking…" : "Check and preview"}
              </button>
              <p className="text-xs text-neutral-500">
                Reads your own mailbox to prove the setup. Changes nothing.
              </p>
            </div>

            {check && (
              <div className="mt-3">
                <p
                  role="status"
                  className={`text-xs leading-relaxed ${
                    check.ok ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  {check.ok ? "Working — " : "Not working — "}
                  {check.detail}
                </p>

                {check.preview && (
                  <figure className="mt-3">
                    <figcaption className="label mb-1.5">
                      {check.preview.sample
                        ? "What yours would say (example dates)"
                        : "What yours will say"}
                    </figcaption>
                    <div className="rounded-xl bg-neutral-50 p-3 ring-1 ring-neutral-200">
                      <p className="text-xs font-medium text-neutral-800">
                        {check.preview.subject}
                      </p>
                      <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-neutral-600">
                        {check.preview.bodyText}
                      </pre>
                    </div>
                    {check.preview.contacts.length === 0 && (
                      <p className="mt-2 text-xs leading-relaxed text-amber-700">
                        No colleague could be named here — you&rsquo;re in no Hierarchy group, or
                        everyone in it is away on those dates — so the reply points to the fallback
                        address instead.
                      </p>
                    )}
                  </figure>
                )}
              </div>
            )}
          </div>
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
        <legend className="label">Who gets a reply</legend>

        <label className="flex items-start gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={restrictToDomain}
            onChange={(e) => setRestrictToDomain(e.target.checked)}
          />
          <span>
            Only reply to colleagues
            <span className="block text-xs text-neutral-500">
              Off by default. Leaving it off is the point of the feature — a client writing in is
              exactly who needs telling who to contact instead.
            </span>
          </span>
        </label>
      </fieldset>

      <div>
        <label htmlFor="auto-reply-fallback" className="label">
          Fallback address
        </label>
        <input
          id="auto-reply-fallback"
          type="email"
          className="input mt-1.5"
          placeholder="art@blackbird.marketing"
          value={fallbackEmail}
          onChange={(e) => setFallbackEmail(e.target.value)}
        />
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
          Used only when no colleague can be named — nobody in their Hierarchy group, or everyone
          in it away at once. Leave it blank to use art@blackbird.marketing.
        </p>
      </div>

      <div>
        <label htmlFor="auto-reply-note" className="label">
          Extra line
        </label>
        <textarea
          id="auto-reply-note"
          className="input mt-1.5 min-h-20"
          maxLength={NOTE_MAX}
          placeholder="For anything urgent, call the office on +383 …"
          value={extraNote}
          onChange={(e) => setExtraNote(e.target.value)}
        />
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
          Added to every reply, above the sign-off. {NOTE_MAX - extraNote.length} characters left.
        </p>
      </div>

      <p className="text-xs leading-relaxed text-neutral-500">
        Changes apply to replies set from now on. Anyone already away keeps the wording they were
        given until their next booking.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary px-4 text-sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn-ghost px-3 text-sm"
          onClick={() => {
            setRestrictToDomain(settings.restrictToDomain);
            setFallbackEmail(settings.fallbackEmail);
            setExtraNote(settings.extraNote);
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

/**
 * Everything wrong with this integration is invisible from the outside, so the
 * card has to say it. Ordered by how badly it breaks the feature: a missing
 * migration stops all of it, a failing mailbox stops one person, an empty
 * Hierarchy leaves the replies working but vague.
 */
function Warnings({ settings }: { settings: AutoReplyPanel }) {
  const messages: React.ReactNode[] = [];

  if (settings.migrationMissing) {
    messages.push(
      <>
        The database is missing this feature&rsquo;s tables, so nothing is being set. Run{" "}
        <code>supabase/migrations/014_gmail_auto_reply.sql</code> in the Supabase SQL editor.
      </>
    );
  }

  if (!settings.credentialsPresent) {
    messages.push(
      <>
        The Google service account is no longer configured on this deployment, so no mailbox can be
        reached. Check <code>GOOGLE_SA_CLIENT_EMAIL</code> and <code>GOOGLE_SA_PRIVATE_KEY</code>.
      </>
    );
  }

  if (settings.failing > 0) {
    messages.push(
      <>
        {settings.failing} mailbox{settings.failing === 1 ? "" : "es"} couldn&rsquo;t be set.
        {settings.sampleError && (
          <span className="mt-1 block font-mono text-[11px] text-neutral-500">
            {settings.sampleError}
          </span>
        )}
      </>
    );
  }

  if (settings.outsideDomain > 0) {
    messages.push(
      <>
        {settings.outsideDomain} {settings.outsideDomain === 1 ? "person is" : "people are"} on an
        address outside {settings.domain}, so their mailbox can&rsquo;t be reached. They&rsquo;re
        skipped; everyone else is unaffected.
      </>
    );
  }

  if (settings.groups === 0) {
    messages.push(
      <>
        There are no Hierarchy groups, so every reply points to {settings.fallbackEmail} instead of
        a colleague. Set groups up under People → Hierarchy.
      </>
    );
  }

  if (messages.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      {messages.map((message, i) => (
        <p key={i} role="alert" className="text-xs leading-relaxed text-amber-700">
          {message}
        </p>
      ))}
    </div>
  );
}
