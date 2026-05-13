import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { yearBounds } from "@/lib/days";
import TopBar from "@/components/TopBar";
import AllowanceEditor from "./AllowanceEditor";

export default async function EmployeesPage() {
  const profile = await requireAdmin();
  const supabase = await createServerClient();
  const { from, to } = yearBounds();

  const [{ data: employees }, { data: rows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role, annual_allowance, sick_allowance")
      .order("full_name"),
    supabase
      .from("leave_requests")
      .select("user_id, type, status, days_count")
      .in("status", ["approved", "pending"])
      .gte("start_date", from)
      .lte("start_date", to),
  ]);

  const usage = new Map<string, { au: number; ap: number; su: number; sp: number }>();
  for (const r of rows ?? []) {
    const cur = usage.get(r.user_id) ?? { au: 0, ap: 0, su: 0, sp: 0 };
    const d = Number(r.days_count);
    if (r.type === "annual" && r.status === "approved") cur.au += d;
    if (r.type === "annual" && r.status === "pending") cur.ap += d;
    if (r.type === "sick" && r.status === "approved") cur.su += d;
    if (r.type === "sick" && r.status === "pending") cur.sp += d;
    usage.set(r.user_id, cur);
  }

  return (
    <div className="bg-app min-h-screen">
      <TopBar profile={profile} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Admin</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Employees</h1>
          <p className="mt-1 text-sm text-slate-500">
            {(employees ?? []).length} member{(employees ?? []).length === 1 ? "" : "s"} · adjust per-person leave allowances below
          </p>
        </header>

        <section className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/60 text-slate-500 border-b border-slate-200">
                <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Name</th>
                <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Email</th>
                <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Role</th>
                <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Annual (used / pending / allow)</th>
                <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Sick (used / pending / allow)</th>
                <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Edit allowances</th>
              </tr>
            </thead>
            <tbody>
              {(employees ?? []).map((e: any) => {
                const u = usage.get(e.id) ?? { au: 0, ap: 0, su: 0, sp: 0 };
                return (
                  <tr key={e.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/40 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-900">{e.full_name}</td>
                    <td className="py-3 px-4 text-slate-500">{e.email}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${e.role === "admin" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
                        {e.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700 tabular-nums">{u.au} / {u.ap} / {e.annual_allowance}</td>
                    <td className="py-3 px-4 text-slate-700 tabular-nums">{u.su} / {u.sp} / {e.sick_allowance}</td>
                    <td className="py-3 px-4">
                      <AllowanceEditor
                        id={e.id}
                        annual={Number(e.annual_allowance)}
                        sick={Number(e.sick_allowance)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
