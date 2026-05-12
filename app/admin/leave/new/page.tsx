import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import AdminLogLeaveForm from "./AdminLogLeaveForm";

export default async function NewLeaveOnBehalfPage() {
  const profile = await requireAdmin();
  const supabase = await createServerClient();
  const [{ data: employees }, { data: holidays }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
    supabase.from("public_holidays").select("date").order("date"),
  ]);

  return (
    <div>
      <TopBar profile={profile} />
      <main className="max-w-2xl mx-auto px-6 py-8 space-y-4">
        <h1 className="text-2xl font-bold">Log leave for an employee</h1>
        <p className="text-sm text-slate-500">
          Use this to record leave on behalf of someone (e.g. a sick day called in over the phone). The leave will be marked approved immediately and the employee will be notified by email.
        </p>
        <div className="card p-6">
          <AdminLogLeaveForm
            employees={(employees ?? []) as { id: string; full_name: string; email: string }[]}
            holidays={(holidays ?? []).map((h) => h.date)}
          />
        </div>
      </main>
    </div>
  );
}
