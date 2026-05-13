import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { yearBounds } from "@/lib/days";
import TopBar from "@/components/TopBar";
import LeaveCalendar from "@/components/LeaveCalendar";

export default async function DashboardPage() {
  const profile = await requireUser();
  const supabase = await createServerClient();
  const { from, to } = yearBounds();

  const [{ data: holidays }, { data: teamRows }] = await Promise.all([
    supabase.from("public_holidays").select("date, name").order("date"),
    supabase
      .from("leave_requests")
      .select("id, type, status, start_date, end_date, user_id, profiles:user_id(full_name)")
      .eq("status", "approved")
      .gte("end_date", from)
      .lte("start_date", to),
  ]);

  const teamEvents = (teamRows ?? []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.profiles?.full_name ?? "Employee",
    type: r.type,
    status: r.status,
    start: r.start_date,
    end: r.end_date,
  }));

  return (
    <div>
      <TopBar profile={profile} />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <section className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Who's off</h2>
            <Link href="/dashboard/request" className="btn-primary">
              Request leave
            </Link>
          </div>
          <LeaveCalendar
            events={teamEvents}
            holidays={holidays ?? []}
            viewerUserId={profile.id}
          />
        </section>
      </main>
    </div>
  );
}
