import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { getEveryonesLeaveContext } from "@/lib/leave-policies";
import PolicyEditor from "./PolicyEditor";

export default async function EditLeavePolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { setup, people } = await getEveryonesLeaveContext();
  if (!setup.ready) redirect("/admin/policies");

  const policy = setup.policies.find((p) => p.id === id);
  if (!policy) redirect("/admin/policies");

  // Types someone has booked can be switched off but not deleted.
  const supabase = await createServerClient();
  const { data: booked } = await supabase.from("leave_requests").select("type");
  const usedTypes = Array.from(new Set((booked ?? []).map((r: { type: string }) => r.type)));

  const onIt = people.filter((p) => p.memberOf === id || (policy.isDefault && p.memberOf === null));

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <Link
        href="/admin/policies"
        className="inline-flex min-h-11 items-center gap-1 px-2 -mx-2 mb-3 text-xs font-medium text-neutral-500 transition hover:text-neutral-900"
      >
        ← Back to leave policies
      </Link>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">{policy.name}</h1>
          {policy.isDefault && (
            <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-800">
              Default
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {onIt.length === 0
            ? "Nobody is on this template yet. Add people from the leave policies page."
            : `Applies to ${onIt.length} ${onIt.length === 1 ? "person" : "people"}${
                policy.isDefault ? ", including everyone not added to another template" : ""
              }. Changes apply to their balances and request forms as soon as you save.`}
        </p>
      </header>

      <PolicyEditor policy={policy} usedTypes={usedTypes} />
    </main>
  );
}
