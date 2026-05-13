import Link from "next/link";
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
    <div className="bg-app min-h-screen">
      <TopBar profile={profile} />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition mb-6"
        >
          ← Back to admin
        </Link>

        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Admin</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Log leave on behalf</h1>
          <p className="mt-1 text-sm text-slate-500">
            Use this for sick days called in over the phone or backfilling missed entries. Marked approved immediately and the employee gets an email confirmation.
          </p>
        </header>

        <section className="card p-4 sm:p-6">
          <AdminLogLeaveForm
            employees={(employees ?? []) as { id: string; full_name: string; email: string }[]}
            holidays={(holidays ?? []).map((h) => h.date)}
          />
        </section>
      </main>
    </div>
  );
}
