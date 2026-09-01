import { isWeekend, parseISO } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { datesInRange } from "@/lib/days";

export type AnnualConflict = {
  groupName: string;
  /** First working day in the range that would leave the group with nobody available. */
  day: string;
  /** Group-mates already on annual leave that day. */
  offNames: string[];
};

/**
 * Hierarchy rule: at least one member of a conflict group must always be
 * available. A member's ANNUAL leave request is blocked if, on any working day
 * of the range, every other member of one of their groups is already on
 * approved or pending annual leave — i.e. the requester would be the last
 * person out. Weekends and public holidays are skipped (nobody is expected to
 * be available then), and sick leave is never counted or blocked.
 *
 * Runs on the service-role client: the caller is often an employee whose RLS
 * can't see other people's leave rows. If the conflict tables don't exist yet
 * (migration 007 not run), this fails open so leave requests keep working.
 */
export async function findAnnualConflicts(opts: {
  userId: string;
  startDate: string;
  endDate: string;
  excludeRequestId?: string;
}): Promise<AnnualConflict[]> {
  const admin = createAdminClient();

  const { data: myGroups, error: groupsError } = await admin
    .from("conflict_group_members")
    .select("group_id")
    .eq("user_id", opts.userId);
  if (groupsError) {
    console.warn("conflict check skipped:", groupsError.message);
    return [];
  }
  const groupIds = (myGroups ?? []).map((g) => g.group_id);
  if (groupIds.length === 0) return [];

  const [{ data: memberRows }, { data: groups }, { data: holidays }] = await Promise.all([
    admin.from("conflict_group_members").select("group_id, user_id").in("group_id", groupIds),
    admin.from("conflict_groups").select("id, name").in("id", groupIds),
    admin
      .from("public_holidays")
      .select("date")
      .gte("date", opts.startDate)
      .lte("date", opts.endDate),
  ]);

  const othersByGroup = new Map<string, string[]>();
  for (const m of memberRows ?? []) {
    if (m.user_id === opts.userId) continue;
    othersByGroup.set(m.group_id, [...(othersByGroup.get(m.group_id) ?? []), m.user_id]);
  }
  const allOthers = [...new Set([...othersByGroup.values()].flat())];
  if (allOthers.length === 0) return [];

  let query = admin
    .from("leave_requests")
    .select("id, user_id, start_date, end_date")
    .in("user_id", allOthers)
    .eq("type", "annual")
    .in("status", ["approved", "pending"])
    .lte("start_date", opts.endDate)
    .gte("end_date", opts.startDate);
  if (opts.excludeRequestId) query = query.neq("id", opts.excludeRequestId);
  const { data: leaveRows } = await query;
  if (!leaveRows || leaveRows.length === 0) return [];

  const holidaySet = new Set((holidays ?? []).map((h: { date: string }) => h.date));
  const workingDays = datesInRange(opts.startDate, opts.endDate).filter(
    (d) => !isWeekend(parseISO(d)) && !holidaySet.has(d)
  );
  if (workingDays.length === 0) return [];

  const groupNameById = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const isOffOn = (userId: string, day: string) =>
    leaveRows.some((r) => r.user_id === userId && r.start_date <= day && r.end_date >= day);

  // For each group, find the first working day on which every other member is
  // already off — that day the requester would leave nobody available.
  const conflicts: AnnualConflict[] = [];
  const offIds = new Set<string>();
  for (const [groupId, others] of othersByGroup) {
    for (const day of workingDays) {
      const off = others.filter((id) => isOffOn(id, day));
      if (off.length === others.length) {
        conflicts.push({
          groupName: groupNameById.get(groupId) ?? "conflict group",
          day,
          offNames: off, // ids for now; swapped for names below
        });
        off.forEach((id) => offIds.add(id));
        break;
      }
    }
  }
  if (conflicts.length === 0) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", [...offIds]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  for (const c of conflicts) {
    c.offNames = c.offNames.map((id) => nameById.get(id) ?? "a colleague");
  }
  return conflicts;
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** One readable sentence for the first conflict, plus a count of any others. */
export function describeConflict(conflicts: AnnualConflict[], subject: "you" | "they"): string {
  const c = conflicts[0];
  const who = c.offNames.length === 1
    ? `${listNames(c.offNames)} — the only other member of the "${c.groupName}" group — is`
    : `everyone else in the "${c.groupName}" group (${listNames(c.offNames)}) is`;
  const whose = subject === "you" ? "your" : "their";
  const more = conflicts.length > 1 ? ` The same problem exists in ${conflicts.length - 1} more group${conflicts.length > 2 ? "s" : ""}.` : "";
  return `On ${c.day}, ${who} already on annual leave. At least one member must stay available, so ${whose} annual leave can't cover that day.${more}`;
}
