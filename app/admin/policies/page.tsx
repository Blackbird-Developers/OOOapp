import { requireAdmin } from "@/lib/auth";
import { getEveryonesLeaveContext } from "@/lib/leave-policies";
import { describeLimit, monthDayLabel, type LeavePolicy } from "@/lib/leave-rules";
import EmptyState from "@/components/EmptyState";
import PolicyManager, { type Person, type Template } from "./PolicyManager";

/** Plain-language lines for a template card. */
function summarize(policy: LeavePolicy): { annual: string; others: string } {
  const annualRule = policy.rules.find((r) => r.type === "annual");
  const parts = [annualRule ? describeLimit(annualRule) : "No annual leave"];
  if (policy.seniority.enabled) {
    const { extraDays, everyYears } = policy.seniority;
    parts.push(`+${extraDays} day${extraDays === 1 ? "" : "s"} every ${everyYears} year${everyYears === 1 ? "" : "s"} of experience`);
  }
  if (policy.firstYear.enabled) {
    parts.push(`${policy.firstYear.daysPerMonth} a month in the first year`);
  }
  if (policy.carryOver.enabled) {
    const { maxDays, expires } = policy.carryOver;
    parts.push(
      `up to ${maxDays} day${maxDays === 1 ? "" : "s"} carry over` + (expires ? ` (use by ${monthDayLabel(expires)})` : "")
    );
  }
  const others = policy.rules.filter((r) => r.enabled && r.type !== "annual").map((r) => r.name);
  return {
    annual: `Annual leave: ${parts.join(", ")}.`,
    others: others.length ? `Also: ${others.join(", ")}.` : "No other leave types switched on.",
  };
}

export default async function LeavePoliciesPage() {
  await requireAdmin();
  const { setup, people } = await getEveryonesLeaveContext();

  const header = (
    <header className="mb-6">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Leave policies</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Build a template of leave rules, then add the people it applies to. Anyone you haven&apos;t added to a
        template follows the default one.
      </p>
    </header>
  );

  if (!setup.ready) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {header}
        <EmptyState
          title="Leave policies aren't set up yet"
          description={
            <>
              Run <code className="text-neutral-700">supabase/migrations/013_leave_policies.sql</code> in the Supabase
              SQL editor, then reload this page. Until then everyone keeps the allowance set on the Employees page.
            </>
          }
        />
      </main>
    );
  }

  const everyone: Person[] = people.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    memberOf: p.memberOf,
  }));

  const templates: Template[] = setup.policies.map((policy) => ({
    id: policy.id!,
    name: policy.name,
    isDefault: policy.isDefault,
    ...summarize(policy),
    members: everyone.filter((p) => p.memberOf === policy.id),
  }));

  // People who were never added anywhere follow whichever template is the default.
  const followingDefault = everyone.filter((p) => p.memberOf === null);

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {header}
      <PolicyManager templates={templates} people={everyone} followingDefault={followingDefault} />
    </main>
  );
}
