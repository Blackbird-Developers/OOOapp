import { format } from "date-fns";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { todayISOIn, yearBounds } from "@/lib/days";
import { loadSlackSettings } from "@/lib/slack-settings";
import LeaveCalendar from "@/components/LeaveCalendar";
import TodayStrip from "@/components/TodayStrip";
import SlackDigestButton from "@/components/SlackDigestButton";

export default async function AdminWhosOffPage() {
  const profile = await requireAdmin();
  const supabase = await createServerClient();
  const { from, to } = yearBounds();
  const now = new Date();
  // Office wall clock, not the server's. Vercel runs UTC, which would call it
  // "yesterday" during the small hours of Irish summer time — and the Slack
  // digest has to agree with this page about what "today" means.
  const todayISO = todayISOIn();
  const slack = await loadSlackSettings();

  const [{ data: holidays }, { data: teamRows }] = await Promise.all([
    supabase.from("public_holidays").select("date, name").order("date"),
    supabase
      .from("leave_requests")
      .select("id, type, status, start_date, end_date, user_id, profiles:user_id(full_name)")
      .or(`status.eq.approved,and(status.eq.pending,user_id.eq.${profile.id})`)
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

  const offTodayMap = new Map<string, string>();
  for (const ev of teamEvents) {
    if (ev.status === "approved" && todayISO >= ev.start && todayISO <= ev.end) {
      offTodayMap.set(ev.userId, ev.userName);
    }
  }
  const offToday = Array.from(offTodayMap.values());
  const holidayToday = (holidays ?? []).find((h) => h.date === todayISO) ?? null;

  const horizonISO = format(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
  const upcomingMap = new Map<string, { name: string; start: string }>();
  for (const ev of teamEvents) {
    if (ev.status !== "approved") continue;
    if (ev.start > todayISO && ev.start <= horizonISO) {
      const existing = upcomingMap.get(ev.userId);
      if (!existing || ev.start < existing.start) {
        upcomingMap.set(ev.userId, { name: ev.userName, start: ev.start });
      }
    }
  }
  const upcoming = Array.from(upcomingMap.values()).sort((a, b) => a.start.localeCompare(b.start));

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
            Team availability
          </h1>
          <p className="mt-1 text-sm text-neutral-500">{format(now, "EEEE, d MMMM yyyy")}</p>
        </div>
        {slack.connected && <SlackDigestButton />}
      </header>

      <TodayStrip
        offToday={offToday}
        holidayToday={holidayToday}
        viewerName={profile.full_name}
        upcoming={upcoming}
      />

      <section className="card mt-6 p-4 sm:p-6">
        <div className="mb-5 flex items-baseline justify-between">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 tracking-tight">Who's off</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Approved leave across the team this year</p>
          </div>
          <span className="text-[11px] uppercase tracking-wider font-medium text-neutral-500">
            {teamEvents.length} {teamEvents.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        <LeaveCalendar
          events={teamEvents}
          holidays={holidays ?? []}
        />
      </section>
    </main>
  );
}
