import Link from "next/link";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { yearBounds } from "@/lib/days";
import TopBar from "@/components/TopBar";
import LeaveCalendar from "@/components/LeaveCalendar";
import ApprovalCelebration from "@/components/ApprovalCelebration";

export default async function DashboardPage() {
  const profile = await requireUser();
  const supabase = await createServerClient();
  const { from, to } = yearBounds();
  const now = new Date();
  const todayISO = format(now, "yyyy-MM-dd");
  const sinceISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: holidays }, { data: teamRows }] = await Promise.all([
    supabase.from("public_holidays").select("date, name").order("date"),
    supabase
      .from("leave_requests")
      .select("id, type, status, start_date, end_date, user_id, days_count, decided_at, profiles:user_id(full_name)")
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

  const myApproved = (teamRows ?? [])
    .filter((r: any) => r.user_id === profile.id && r.decided_at && r.decided_at >= sinceISO)
    .map((r: any) => ({
      id: r.id,
      type: r.type,
      start_date: r.start_date,
      end_date: r.end_date,
      days_count: r.days_count,
    }));

  // Who's off today (de-dup by user)
  const offTodayMap = new Map<string, string>();
  for (const ev of teamEvents) {
    if (todayISO >= ev.start && todayISO <= ev.end) {
      offTodayMap.set(ev.userId, ev.userName);
    }
  }
  const offToday = Array.from(offTodayMap.values());
  const holidayToday = (holidays ?? []).find((h) => h.date === todayISO) ?? null;

  return (
    <div className="bg-slate-50/60 min-h-screen">
      <TopBar profile={profile} />
      <ApprovalCelebration userId={profile.id} approved={myApproved} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Team availability
            </h1>
            <p className="mt-1 text-sm text-slate-500">{format(now, "EEEE, d MMMM yyyy")}</p>
          </div>
          <Link
            href="/dashboard/request"
            className="btn-primary w-full sm:w-auto"
          >
            Request leave
            <span aria-hidden>→</span>
          </Link>
        </header>

        <TodayStrip
          offToday={offToday}
          holidayToday={holidayToday}
          viewerName={profile.full_name}
        />

        <section className="card mt-6 p-4 sm:p-6">
          <div className="mb-5 flex items-baseline justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">Who's off</h2>
              <p className="text-xs text-slate-500 mt-0.5">Approved leave across the team this year</p>
            </div>
            <span className="text-[11px] uppercase tracking-wider font-medium text-slate-400">
              {teamEvents.length} {teamEvents.length === 1 ? "entry" : "entries"}
            </span>
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

function TodayStrip({
  offToday,
  holidayToday,
  viewerName,
}: {
  offToday: string[];
  holidayToday: { date: string; name: string } | null;
  viewerName: string;
}) {
  const viewerFirst = viewerName.split(" ")[0];
  const peersOff = offToday.filter((n) => n.split(" ")[0] !== viewerFirst);
  const isYouOff = offToday.length !== peersOff.length;

  let dot = "bg-emerald-500";
  let title = "Everyone's in today";
  let detail = "Nothing on the calendar for today.";

  if (holidayToday) {
    dot = "bg-amber-500";
    title = "Public holiday";
    detail = holidayToday.name;
  } else if (peersOff.length > 0 || isYouOff) {
    dot = "bg-indigo-500";
    const count = offToday.length;
    title = `${count} ${count === 1 ? "person" : "people"} off today`;
    const parts: string[] = [];
    if (isYouOff) parts.push("you");
    if (peersOff.length > 0) parts.push(peersOff.map((n) => n.split(" ")[0]).join(", "));
    detail = parts.join(" · ");
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className={`absolute inline-flex h-full w-full rounded-full ${dot} opacity-40 animate-ping`} />
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dot}`} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900">{title}</div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">{detail}</div>
        </div>
      </div>
    </div>
  );
}
