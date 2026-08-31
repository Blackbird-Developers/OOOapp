import { requireAdmin } from "@/lib/auth";
import { listIntegrations } from "@/lib/integrations";
import IntegrationCard from "@/components/IntegrationCard";

export default async function IntegrationsPage() {
  // The admin layout already gates this, but the page asserts it too — same as
  // every other page under /admin. One redirect is the guarantee; the second
  // is what stops a future refactor of the layout from quietly opening it up.
  await requireAdmin();

  const integrations = listIntegrations();
  const connected = integrations.filter((i) => i.connected).length;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <header className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Integrations</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Services Blackbird Leave connects to.
          </p>
        </div>
        <span className="text-[11px] uppercase tracking-wider font-medium text-neutral-500">
          {connected} of {integrations.length} connected
        </span>
      </header>

      <div className="space-y-4">
        {integrations.map((integration) => (
          <IntegrationCard key={integration.id} integration={integration} />
        ))}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-neutral-500">
        More integrations will appear here as they are added.
      </p>
    </main>
  );
}
