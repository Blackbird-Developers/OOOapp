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
    <div>
      <TopBar profile={profile} />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-4">
        <h1 className="text-2xl font-bold">Employees</h1>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Annual (used / pending / allow)</th>
                <th>Sick (used / pending / allow)</th>
                <th>Edit allowances</th>
              </tr>
            </thead>
            <tbody>
              {(employees ?? []).map((e: any) => {
                const u = usage.get(e.id) ?? { au: 0, ap: 0, su: 0, sp: 0 };
                return (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="py-2 px-4 font-medium">{e.full_name}</td>
                    <td className="text-slate-500">{e.email}</td>
                    <td className="capitalize">{e.role}</td>
                    <td>{u.au} / {u.ap} / {e.annual_allowance}</td>
                    <td>{u.su} / {u.sp} / {e.sick_allowance}</td>
                    <td>
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
        </div>
      </main>
    </div>
  );
}
