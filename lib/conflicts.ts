import { createAdminClient } from "@/lib/supabase/admin";

export type AnnualConflict = {
  userName: string;
  groupName: string;
  startDate: string;
  endDate: string;
  status: "approved" | "pending";
};

/**
 * Hierarchy rule: people in the same conflict group can't have overlapping
 * ANNUAL leave. Returns every group-mate whose approved/pending annual leave
 * overlaps the given range.
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

  const [{ data: mates }, { data: groups }] = await Promise.all([
    admin
      .from("conflict_group_members")
      .select("group_id, user_id")
      .in("group_id", groupIds)
      .neq("user_id", opts.userId),
    admin.from("conflict_groups").select("id, name").in("id", groupIds),
  ]);
  if (!mates || mates.length === 0) return [];

  const groupNameById = new Map((groups ?? []).map((g) => [g.id, g.name]));
  // A mate can share several groups with the user; report the first.
  const groupByUser = new Map<string, string>();
  for (const m of mates) {
    if (!groupByUser.has(m.user_id)) {
      groupByUser.set(m.user_id, groupNameById.get(m.group_id) ?? "conflict group");
    }
  }

  let query = admin
    .from("leave_requests")
    .select("id, user_id, start_date, end_date, status")
    .in("user_id", [...groupByUser.keys()])
    .eq("type", "annual")
    .in("status", ["approved", "pending"])
    .lte("start_date", opts.endDate)
    .gte("end_date", opts.startDate);
  if (opts.excludeRequestId) query = query.neq("id", opts.excludeRequestId);
  const { data: overlapping } = await query;
  if (!overlapping || overlapping.length === 0) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", [...new Set(overlapping.map((r) => r.user_id))]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return overlapping.map((r) => ({
    userName: nameById.get(r.user_id) ?? "A colleague",
    groupName: groupByUser.get(r.user_id) ?? "conflict group",
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status as "approved" | "pending",
  }));
}

/** One readable sentence for the first conflict, plus a count of any others. */
export function describeConflict(conflicts: AnnualConflict[], subject: "you" | "they"): string {
  const c = conflicts[0];
  const range = c.startDate === c.endDate ? `on ${c.startDate}` : `${c.startDate} → ${c.endDate}`;
  const more = conflicts.length > 1 ? ` (and ${conflicts.length - 1} more clash${conflicts.length > 2 ? "es" : ""})` : "";
  const tail =
    subject === "you"
      ? `You're both in the "${c.groupName}" group, so your annual leave can't overlap.`
      : `They're both in the "${c.groupName}" group, so their annual leave can't overlap.`;
  return `${c.userName} already has ${c.status} annual leave ${range}${more}. ${tail}`;
}
