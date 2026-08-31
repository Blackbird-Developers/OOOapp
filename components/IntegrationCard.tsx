import type { Integration, IntegrationId } from "@/lib/integrations";
import SlackDigestButton from "@/components/SlackDigestButton";

/**
 * One service on the Integrations page: what it does, whether it's wired up,
 * and whatever an admin can do with it from here.
 *
 * Presentational only. It renders whatever `lib/integrations` reports, so a
 * new service needs a registry entry, not a change here (beyond an icon and
 * any controls of its own).
 */
export default function IntegrationCard({ integration }: { integration: Integration }) {
  const { id, name, category, summary, connected, details, setupSteps, docs } = integration;

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
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {details.map((d) => (
              <div key={d.label}>
                <dt className="label">{d.label}</dt>
                <dd className="text-sm text-neutral-800">{d.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div>
            <p className="text-sm text-neutral-800">
              Set up outside the app, with environment variables rather than a button here.
            </p>
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
          </div>
        )}
      </div>

      {connected && <IntegrationActions integration={integration} />}
    </section>
  );
}

/**
 * The per-integration control panel. Slack's is a manual digest post, which is
 * how an admin proves the token, channel and bot membership are right without
 * waiting for tomorrow morning.
 */
function IntegrationActions({ integration }: { integration: Integration }) {
  if (integration.id !== "slack") return null;

  return (
    <div className="mt-5 border-t border-neutral-200 pt-5">
      <SlackDigestButton align="start" />
      <p className="mt-2 text-xs leading-relaxed text-neutral-500">
        Sends today's digest to the channel immediately, even on a quiet day, so you get proof the
        wiring is right. If it fails, the reason is shown here.
      </p>
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

function IconTile({ id, connected }: { id: IntegrationId; connected: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
        connected ? "bg-brand-ink text-white" : "bg-neutral-100 text-neutral-400"
      }`}
    >
      <IntegrationIcon id={id} />
    </span>
  );
}

function IntegrationIcon({ id }: { id: IntegrationId }) {
  if (id === "slack") return <HashIcon />;
  return <PlugIcon />;
}

/** A channel hash, which is what the Slack integration actually writes into. */
function HashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="9.5" y1="3.5" x2="7.5" y2="20.5" />
      <line x1="16.5" y1="3.5" x2="14.5" y2="20.5" />
      <line x1="3.5" y1="9" x2="20.5" y2="9" />
      <line x1="3.5" y1="15" x2="20.5" y2="15" />
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
