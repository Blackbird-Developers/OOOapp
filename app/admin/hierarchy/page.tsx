import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import HierarchyManager, { type Group, type Person } from "./HierarchyManager";

export default async function HierarchyPage() {
  await requireAdmin();
  const supabase = await createServerClient();

  const [{ data: groups }, { data: members }, { data: profiles }] = await Promise.all([
    supabase.from("conflict_groups").select("id, name").order("created_at"),
    supabase.from("conflict_group_members").select("group_id, user_id"),
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
  ]);

  const people: Person[] = (profiles ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
  }));
  const personById = new Map(people.map((p) => [p.id, p]));

  const composed: Group[] = (groups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    members: (members ?? [])
      .filter((m) => m.group_id === g.id)
      .map((m) => personById.get(m.user_id))
      .filter((p): p is Person => Boolean(p))
      .sort((a, b) => a.full_name.localeCompare(b.full_name)),
  }));

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Hierarchy</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Group people who cover for each other. At least one member of each group must always
          be available — <span className="font-medium text-neutral-700">annual</span> leave that
          would leave a group with nobody present is blocked automatically. Sick leave is never
          blocked.
        </p>
      </header>

      <HierarchyManager initialGroups={composed} people={people} />
    </main>
  );
}
