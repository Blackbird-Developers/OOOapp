import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { todayISOIn } from "@/lib/days";
import { getEveryonesLeaveContext, getLeaveRows, type PersonLeave } from "@/lib/leave-policies";
import { yearBalances, type YearBalance } from "@/lib/leave-rules";
import AllowanceEditor from "./AllowanceEditor";
import EmploymentEditor from "./EmploymentEditor";
import DeleteEmployeeButton from "./DeleteEmployeeButton";

export default async function EmployeesPage() {
  const me = await requireAdmin();
  const todayISO = todayISOIn();
  const year = Number(todayISO.slice(0, 4));

  const [{ setup, people }, rows] = await Promise.all([getEveryonesLeaveContext(), getLeaveRows()]);

  const rowsByUser = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = rowsByUser.get(r.user_id);
    if (list) list.push(r);
    else rowsByUser.set(r.user_id, [r]);
  }

  const employees = people.map((p) => {
    const balances = yearBalances(p.policy, p.employment, rowsByUser.get(p.id) ?? [], year, todayISO);
    return {
      ...p,
      annual: balances.find((b) => b.type === "annual") ?? null,
      sick: balances.find((b) => b.type === "sick") ?? null,
    };
  });

  const total = employees.length;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Employees</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {setup.ready ? (
              <>
                {total} member{total === 1 ? "" : "s"}. Allowances come from each person&apos;s{" "}
                <Link href="/admin/policies" className="font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900">
                  leave policy
                </Link>
                . Open someone to see all their leave types, use Edit to set their start date and previous experience, or Delete to remove their account.
              </>
            ) : (
              <>
                {total} member{total === 1 ? "" : "s"}. Use Edit to change a person&apos;s leave allowances,
                or Delete to remove their account.
              </>
            )}
          </p>
        </header>

        {/* Desktop table */}
        <section className="hidden md:block card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50/60 text-neutral-500 border-b border-neutral-200">
                <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Name</th>
                <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Role</th>
                {setup.ready && (
                  <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Leave policy</th>
                )}
                <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Annual remaining</th>
                <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Sick remaining</th>
                <th className="py-3 px-4 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50/40 transition-colors">
                  <td className="py-3 px-4">
                    <Link href={`/admin/employees/${e.id}`} className="font-medium text-neutral-900 underline-offset-2 hover:underline">
                      {e.full_name}
                    </Link>
                    <div className="text-xs text-neutral-500">{e.email}</div>
                  </td>
                  <td className="py-3 px-4">
                    <RolePill role={e.role} />
                  </td>
                  {setup.ready && (
                    <td className="py-3 px-4">
                      <PolicyCell person={e} />
                    </td>
                  )}
                  <td className="py-3 px-4 tabular-nums">
                    <Remaining balance={e.annual} />
                  </td>
                  <td className="py-3 px-4 tabular-nums">
                    <Remaining balance={e.sick} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <ViewLink id={e.id} />
                      <Editor person={e} ready={setup.ready} />
                      {e.id !== me.id && (
                        <DeleteEmployeeButton
                          id={e.id}
                          name={e.full_name}
                          email={e.email}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Mobile card list */}
        <section className="md:hidden space-y-2">
          {employees.map((e) => (
            <div key={e.id} className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <Link href={`/admin/employees/${e.id}`} className="block truncate font-medium text-neutral-900 underline-offset-2 hover:underline">
                    {e.full_name}
                  </Link>
                  <div className="text-xs text-neutral-500 truncate">{e.email}</div>
                </div>
                <RolePill role={e.role} />
              </div>
              {setup.ready && (
                <div className="text-xs text-neutral-600">
                  <span className="text-neutral-500">Leave policy: </span>
                  <PolicyCell person={e} />
                </div>
              )}
              <dl className="grid grid-cols-2 gap-2 text-xs text-neutral-600 tabular-nums mt-2">
                <div>
                  <dt className="text-neutral-500">Annual remaining</dt>
                  <dd><Remaining balance={e.annual} /></dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Sick remaining</dt>
                  <dd><Remaining balance={e.sick} /></dd>
                </div>
              </dl>
              <div className="mt-3 pt-3 border-t border-neutral-100 flex justify-end gap-1">
                <ViewLink id={e.id} />
                <Editor person={e} ready={setup.ready} />
                {e.id !== me.id && (
                  <DeleteEmployeeButton
                    id={e.id}
                    name={e.full_name}
                    email={e.email}
                  />
                )}
              </div>
            </div>
          ))}
        </section>
      </main>
  );
}

/**
 * Before migration 013 the old per-person allowance editor stays, so nothing
 * an admin can do today disappears while the migration is pending.
 */
function Editor({ person, ready }: { person: PersonLeave; ready: boolean }) {
  if (!ready) {
    const annual = person.policy.rules.find((r) => r.type === "annual")?.days ?? 20;
    const sick = person.policy.rules.find((r) => r.type === "sick")?.days ?? 20;
    return <AllowanceEditor id={person.id} annual={Number(annual)} sick={Number(sick)} />;
  }
  return (
    <EmploymentEditor
      id={person.id}
      name={person.full_name}
      startDate={person.employment.startDate}
      priorExperienceMonths={person.employment.priorExperienceMonths}
    />
  );
}

/** Every leave type they have and have taken, on their own page. */
function ViewLink({ id }: { id: string }) {
  return (
    <Link
      href={`/admin/employees/${id}`}
      className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-neutral-600 transition hover:text-neutral-900"
    >
      View
    </Link>
  );
}

function PolicyCell({ person }: { person: PersonLeave }) {
  return (
    <span className="text-neutral-800">
      {person.policy.name}
      {person.memberOf === null && <span className="text-neutral-500"> (default)</span>}
    </span>
  );
}

function Remaining({ balance }: { balance: YearBalance | null }) {
  if (!balance) return <span className="text-sm text-neutral-500">Not on their policy</span>;
  const { remaining, allowance, used, pending, annual } = balance;
  const low = remaining <= 0;
  const notes: string[] = [`${used} used`];
  if (pending > 0) notes.push(`${pending} pending`);
  if (annual?.firstYear) notes.push("first year");
  if (annual && annual.seniorityDays > 0) notes.push(`+${annual.seniorityDays} seniority`);
  if (annual && annual.carriedIn > 0) notes.push(`+${annual.carriedIn} carried`);
  return (
    <div className="leading-tight">
      <div className={`text-sm font-semibold ${low ? "text-rose-600" : "text-neutral-900"}`}>
        {remaining} <span className="font-normal text-neutral-500">of {allowance}</span>
      </div>
      <div className="text-[11px] text-neutral-500">{notes.join(" · ")}</div>
    </div>
  );
}

function RolePill({ role }: { role: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
        role === "admin" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"
      }`}
    >
      {role}
    </span>
  );
}
