import type { Integration, IntegrationId } from "@/lib/integrations";
import SlackDigestButton from "@/components/SlackDigestButton";
import SlackSettingsEditor from "@/components/SlackSettingsEditor";
import SlackConnectForm from "@/components/SlackConnectForm";
import SlackDisconnectButton from "@/components/SlackDisconnectButton";
import SlackMark from "@/components/SlackMark";
import CalendarSettingsEditor from "@/components/CalendarSettingsEditor";
import CalendarConnectButton from "@/components/CalendarConnectButton";
import CalendarDisconnectButton from "@/components/CalendarDisconnectButton";

/**
 * One service on the Integrations page: what it does, whether it's wired up,
 * and whatever an admin can do with it from here.
 *
 * Presentational only. It renders whatever `lib/integrations` reports, so a
 * new service needs a registry entry, not a change here (beyond an icon and
 * any controls of its own).
 */
export default function IntegrationCard({ integration }: { integration: Integration }) {
  const { id, name, category, summary, connected, details, setupIntro, setupSteps, docs } =
    integration;

  return (
    <section className="card p-4 sm:p-6">
      <div className="flex items-start gap-4">
        <IconTile id={id} connected={connected} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="text-base font-semibold tracking-tight text-neutral-900">{name}</h2>
            <span className="text-[11px] uppercase tracking-wider font-medium text-neutral-500">
              {category}
            </span>
            <span className="sm:ml-auto">
              <StatusPill connected={connected} />
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">{summary}</p>
        </div>
      </div>

      <div className="mt-5 border-t border-neutral-200 pt-5">
        {connected ? (
          // A service with an in-place editor renders it; anything else falls
          // back to the read-only list the registry describes.
          integration.slack ? (
            <SlackSettingsEditor details={details} settings={integration.slack} />
          ) : integration.calendar ? (
            <CalendarSettingsEditor details={details} settings={integration.calendar} />
          ) : (
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {details.map((d) => (
                <div key={d.label}>
                  <dt className="label">{d.label}</dt>
                  <dd className="text-sm text-neutral-800">{d.value}</dd>
                </div>
              ))}
            </dl>
          )
        ) : (
          <div>
            <p className="text-sm text-neutral-800">{setupIntro}</p>
            <ol className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-500">
              {setupSteps.map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-semibold text-neutral-700 tabular-nums"
                  >
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-neutral-500">Full instructions: {docs}.</p>

            {integration.slack && <SlackConnectForm initialChannel={integration.slack.channel} />}
            {integration.calendar && (
              <CalendarConnectButton emailConfigured={integration.calendar.emailConfigured} />
            )}
          </div>
        )}
      </div>

      {connected && <IntegrationActions integration={integration} />}
    </section>
  );
}

/**
 * The per-integration control panel. Slack's is a manual digest post — which is
 * how an admin proves the token, channel and bot membership are right without
 * waiting for tomorrow morning — plus the way back out.
 */
function IntegrationActions({ integration }: { integration: Integration }) {
  if (integration.calendar) return <CalendarActions />;
  if (integration.id !== "slack" || !integration.slack) return null;
  const { envVarsPresent, managedInApp } = integration.slack;

  return (
    <div className="mt-5 border-t border-neutral-200 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SlackDigestButton align="start" />
        <SlackDisconnectButton envVarsPresent={envVarsPresent} />
      </div>
      <p className="mt-2 max-w-xl text-xs leading-relaxed text-neutral-500">
        Sends today&rsquo;s digest to the channel immediately, even on a quiet day, so you get proof
        the wiring is right. If it fails, the reason is shown here.
      </p>
      {envVarsPresent && managedInApp && (
        <p className="mt-2 max-w-xl text-xs leading-relaxed text-neutral-500">
          These settings are stored in the app and override the <code>SLACK_</code> environment
          variables still set on this deployment.
        </p>
      )}
    </div>
  );
}

/**
 * Calendar has no equivalent of Slack's "post it now" proof, because there is
 * no channel to watch and no credential that could be silently wrong — the
 * next approval is the test. So the footer is only the way back out.
 */
function CalendarActions() {
  return (
    <div className="mt-5 border-t border-neutral-200 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-xs leading-relaxed text-neutral-500">
          Everyone can find their own subscription link under Account. Entries never name the leave
          type, so a colleague who can see the calendar can&rsquo;t tell annual leave from sick.
        </p>
        <CalendarDisconnectButton />
      </div>
    </div>
  );
}

/**
 * Green reads as "working" faster than any label does, so a connected service
 * gets colour and an unconnected one stays neutral. Emerald rather than the
 * brand lime: lime is spoken for by leave-advancing moments, and a wired-up
 * integration is settled administrative state.
 */
function StatusPill({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        connected ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${
          connected ? "bg-emerald-600" : "ring-1 ring-neutral-400"
        }`}
      />
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}

/**
 * A service with a brand mark gets a white tile, because that's the background
 * those logos are drawn for; one without keeps the ink tile and a line icon.
 * Disconnected desaturates rather than swapping the artwork, so the card reads
 * as the same service either way.
 */
function IconTile({ id, connected }: { id: IntegrationId; connected: boolean }) {
  const tile = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl";

  if (id === "slack") {
    return (
      <span
        aria-hidden
        className={`${tile} bg-white ring-1 ring-neutral-200 ${
          connected ? "" : "opacity-40 grayscale"
        }`}
      >
        <SlackMark className="h-5 w-5" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={`${tile} ${connected ? "bg-brand-ink text-white" : "bg-neutral-100 text-neutral-400"}`}
    >
      {id === "calendar" ? <CalendarIcon /> : <PlugIcon />}
    </span>
  );
}

/**
 * A generic calendar rather than any vendor's mark — the integration reaches
 * Google, Apple and Microsoft through one standard, and picking one of their
 * logos would imply the others were missing.
 */
function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

/** Fallback mark for an integration that hasn't been given its own. */
function PlugIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 3v6" />
      <path d="M15 3v6" />
      <path d="M6 9h12v3a6 6 0 0 1-12 0V9Z" />
      <path d="M12 18v3" />
    </svg>
  );
}
