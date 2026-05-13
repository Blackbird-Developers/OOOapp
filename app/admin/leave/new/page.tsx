import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import AdminLogLeaveForm from "./AdminLogLeaveForm";

export default async function NewLeaveOnBehalfPage() {
  await requireAdmin();
  const supabase = await createServerClient();
  const [{ data: employees }, { data: holidays }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
    supabase.from("public_holidays").select("date").order("date"),
  ]);

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition mb-5"
      >
        ← Back to admin
      </Link>

      <section className="card p-4 sm:p-6">
        <div className="pb-5 mb-6 border-b border-slate-200">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Log leave on behalf</h1>
          <p className="mt-1 text-sm text-slate-500">
            Use for sick days called in over the phone, or to backfill missed entries. Approved immediately; the employee gets an email.
          </p>
        </div>

        <AdminLogLeaveForm
          employees={(employees ?? []) as { id: string; full_name: string; email: string }[]}
          holidays={(holidays ?? []).map((h) => h.date)}
        />
      </section>
    </main>
  );
}
