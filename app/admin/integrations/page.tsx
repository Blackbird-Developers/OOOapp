import { requireAdmin } from "@/lib/auth";
import { listIntegrations } from "@/lib/integrations";
import Link from "next/link";
import IntegrationCard from "@/components/IntegrationCard";
import { isVerified } from "@/lib/verification";

export default async function IntegrationsPage() {
  // The admin layout already gates this, but the page asserts it too — same as
  // every other page under /admin. One redirect is the guarantee; the second
  // is what stops a future refactor of the layout from quietly opening it up.
  const admin = await requireAdmin();

  const [integrations, verified] = await Promise.all([
    listIntegrations(admin.organization_id),
    isVerified(admin.organization_id),
  ]);
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

      {!verified && (
        <p className="mb-4 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
          Verify your company domain before connecting anything new.{" "}
          <Link href="/admin/settings" className="font-medium text-neutral-900 underline">
            Go to Settings
          </Link>
        </p>
      )}

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
