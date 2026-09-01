"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Field from "@/components/Field";
import type { IntegrationDetail, SlackPanel } from "@/lib/integrations";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * The Slack card's settings: read at a glance, edited in place.
 *
 * The read view renders `details` — the same strings the server built — rather
 * than re-deriving them from `settings`, so the summary an admin sees can't
 * drift from the one the registry describes. Saving refreshes the route, which
 * rebuilds both from the row that was just written.
 */
export default function SlackSettingsEditor({
  details,
  settings,
}: {
  details: IntegrationDetail[];
  settings: SlackPanel;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const [channel, setChannel] = useState(settings.channel);
  const [postHour, setPostHour] = useState(settings.postHour);
  const [weekdaysOnly, setWeekdaysOnly] = useState(settings.weekdaysOnly);
  const [silentWhenEmpty, setSilentWhenEmpty] = useState(settings.silentWhenEmpty);
  const [shareHalfDays, setShareHalfDays] = useState(settings.shareHalfDays);
  const [token, setToken] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    channel.trim() !== settings.channel ||
    postHour !== settings.postHour ||
    weekdaysOnly !== settings.weekdaysOnly ||
    silentWhenEmpty !== settings.silentWhenEmpty ||
    shareHalfDays !== settings.shareHalfDays ||
    token.trim() !== "";

  function cancel() {
    setChannel(settings.channel);
    setPostHour(settings.postHour);
    setWeekdaysOnly(settings.weekdaysOnly);
    setSilentWhenEmpty(settings.silentWhenEmpty);
    setShareHalfDays(settings.shareHalfDays);
    setToken("");
    setError(null);
    setEditing(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // Only send what changed. A no-op PATCH would still rewrite the row and
    // stamp a new updated_by, which makes the audit trail lie about who last
    // touched the settings.
    const patch: Record<string, unknown> = {};
    if (channel.trim() !== settings.channel) patch.channel_id = channel.trim();
    if (postHour !== settings.postHour) patch.post_hour = postHour;
    if (weekdaysOnly !== settings.weekdaysOnly) patch.weekdays_only = weekdaysOnly;
    if (silentWhenEmpty !== settings.silentWhenEmpty) patch.silent_when_empty = silentWhenEmpty;
    if (shareHalfDays !== settings.shareHalfDays) patch.share_half_days = shareHalfDays;
    if (token.trim()) patch.bot_token = token.trim();

    try {
      const res = await fetch("/api/integrations/slack", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json.error || "Couldn't save the settings. Try again.");
        return;
      }

      setToken("");
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
      <div className="flex items-start gap-4">
        <dl className="grid flex-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {details.map((d) => (
            <div key={d.label}>
              <dt className="label">{d.label}</dt>
              <dd className="text-sm text-neutral-800">{d.value}</dd>
            </div>
          ))}
        </dl>
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Channel"
          hint="The channel ID, not the name — e.g. C0123456789."
        >
          {(p) => (
            <input
              {...p}
              className="input font-mono"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="C0123456789"
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </Field>

        <Field label="Posts at" hint="Kosovo time, on the days selected below.">
          {(p) => (
            <select
              {...p}
              className="input"
              value={postHour}
              onChange={(e) => setPostHour(Number(e.target.value))}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <fieldset>
        <legend className="label">Schedule</legend>
        <div className="space-y-2">
          <Toggle checked={weekdaysOnly} onChange={setWeekdaysOnly}>
            Weekdays only
          </Toggle>
          <Toggle checked={silentWhenEmpty} onChange={setSilentWhenEmpty}>
            Stay silent when nobody is off
          </Toggle>
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">Shares</legend>
        <Toggle checked={shareHalfDays} onChange={setShareHalfDays}>
          Include half-day detail (morning / afternoon)
        </Toggle>
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">
          The leave type is never shared, and there's no setting for it. Sick leave and annual
          leave both read as simply &ldquo;out&rdquo; — the digest goes to a channel the whole
          company can see.
        </p>
      </fieldset>

      <Field
        label="Replace bot token"
        hint={
          settings.tokenFromRow
            ? "Leave blank to keep the token already on file."
            : "Leave blank to keep using SLACK_BOT_TOKEN from the environment."
        }
      >
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
          />
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary px-4 text-sm" disabled={!dirty || busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-neutral-500 transition hover:text-neutral-900 disabled:text-neutral-400"
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
    <label className="flex items-center gap-2 text-sm text-neutral-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}
