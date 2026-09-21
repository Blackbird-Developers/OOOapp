import Link from "next/link";
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { getLeaveSummary } from "@/lib/balances";
import { typeNamer } from "@/lib/leave-policies";
import { leaveOverview, monthsWorked } from "@/lib/leave-rules";
import LeaveOverview from "@/components/LeaveOverview";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import EmploymentEditor from "../EmploymentEditor";

/** "9 years, 6 months" */
function duration(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [];
  if (y) parts.push(`${y} year${y === 1 ? "" : "s"}`);
  if (m || !y) parts.push(`${m} month${m === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createServerClient();

  const [{ data: person }, summary, { data: requests }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role").eq("id", id).maybeSingle(),
    getLeaveSummary(id),
    supabase
      .from("leave_requests")
      .select("id, type, start_date, end_date, days_count, status")
      .eq("user_id", id)
      .order("start_date", { ascending: false }),
  ]);
  if (!person) redirect("/admin/employees");

  const overview = leaveOverview(summary.policy, summary.employment, summary.rows, summary.year, summary.todayISO);
  const nameOf = typeNamer(summary.types);
  const { startDate, priorExperienceMonths } = summary.employment;
  const experience = startDate
    ? duration(priorExperienceMonths + monthsWorked(startDate, summary.todayISO))
    : null;
  const count = (requests ?? []).length;

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <Link
        href="/admin/employees"
        className="inline-flex min-h-11 items-center gap-1 px-2 -mx-2 mb-3 text-xs font-medium text-neutral-500 transition hover:text-neutral-900"
      >
        ← Back to employees
      </Link>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">{person.full_name}</h1>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
              person.role === "admin" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"
            }`}
          >
            {person.role}
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-500">{person.email}</p>
      </header>

      <section className="card p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-neutral-900">Employment</h2>
          {summary.ready && (
            <div className="-my-3">
              <EmploymentEditor
                id={person.id}
                name={person.full_name}
                startDate={startDate}
                priorExperienceMonths={priorExperienceMonths}
              />
            </div>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="label">Leave policy</dt>
            <dd className="text-sm text-neutral-900">
              {summary.ready && summary.policy.id ? (
                <Link
                  href={`/admin/policies/${summary.policy.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  {summary.policy.name}
                </Link>
              ) : (
                summary.policy.name
              )}
              {summary.memberOf === null && <span className="text-neutral-500"> (default)</span>}
            </dd>
          </div>
          <div>
            <dt className="label">Started</dt>
            <dd className="text-sm text-neutral-900 tabular-nums">
              {startDate ? format(parseISO(startDate), "d MMMM yyyy") : <span className="text-neutral-500">Not set</span>}
            </dd>
          </div>
          <div>
            <dt className="label">Work experience</dt>
            <dd className="text-sm text-neutral-900 tabular-nums">
              {experience ?? <span className="text-neutral-500">Needs a start date</span>}
              {experience && priorExperienceMonths > 0 && (
                <span className="block text-xs text-neutral-500">
                  Including {duration(priorExperienceMonths)} before the company
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="card mt-6 p-4 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">Leave in {summary.year}</h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          Each type has its own days: taking one never uses up another.
        </p>
        <div className="mt-2">
          <LeaveOverview entries={overview} year={summary.year} who="they" />
        </div>
      </section>

      <section className="card mt-6 p-4 sm:p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold tracking-tight text-neutral-900">Requests</h2>
          <span className="text-[11px] uppercase tracking-wider font-medium text-neutral-500">
            {count} {count === 1 ? "request" : "requests"}
          </span>
        </div>
        {count === 0 ? (
          <div className="mt-4">
            <EmptyState title="No requests yet" description="Leave they request, or you log for them, shows up here." />
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100">
            {(requests ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900">{nameOf(r.type)}</p>
                  <p className="text-xs text-neutral-500 tabular-nums">
                    {r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`} · {r.days_count}{" "}
                    {Number(r.days_count) === 1 ? "day" : "days"}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
