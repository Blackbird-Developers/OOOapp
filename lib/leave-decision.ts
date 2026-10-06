import type { SupabaseClient } from "@supabase/supabase-js";
import { emailDecisionToEmployee } from "@/lib/email";
import { findAnnualConflicts, describeConflict } from "@/lib/conflicts";
import { publishApprovedLeave } from "@/lib/calendar";
import { syncAfterLeaveChange } from "@/lib/auto-reply";
import { leaveTypeName } from "@/lib/leave-policies";
import { refreshSlackApprovalMessages } from "@/lib/slack-approvals";

export type DecisionResult =
  | { ok: true }
  | { ok: false; status: number; error: string; conflict?: boolean };

/**
 * Approve or reject a pending leave request, and everything that follows.
 *
 * One implementation for every place a decision can come from — the Requests
 * page and a button in Slack — so a Slack approval can't quietly skip the
 * employee's email, their calendar entry or their auto-reply.
 *
 * `supabase` is the caller's client: the website passes the admin's own
 * session (RLS applies), Slack passes the service-role client because a
 * button press carries no session. The organization filter on the update is
 * what keeps the service-role path inside the admin's own company.
 */
export async function decideLeaveRequest(opts: {
  supabase: SupabaseClient;
  admin: { id: string; organization_id: string };
  id: string;
  action: "approve" | "reject";
  note?: string | null;
}): Promise<DecisionResult> {
  const { supabase, admin, id } = opts;
  const status = opts.action === "approve" ? "approved" : "rejected";
  const note = opts.note ?? null;

  // Hierarchy rule safety net: don't approve annual leave that now clashes
  // with a conflict-group mate's leave (e.g. approved after the request was
  // logged with an admin override, or a race between two requests).
  if (status === "approved") {
    const { data: pendingRow } = await supabase
      .from("leave_requests")
      .select("user_id, type, start_date, end_date")
      .eq("id", id)
      .eq("organization_id", admin.organization_id)
      .eq("status", "pending")
      .single();
    if (pendingRow && pendingRow.type === "annual") {
      const conflicts = await findAnnualConflicts({
        orgId: admin.organization_id,
        userId: pendingRow.user_id,
        startDate: pendingRow.start_date,
        endDate: pendingRow.end_date,
        excludeRequestId: id,
      });
      if (conflicts.length > 0) {
        return {
          ok: false,
          status: 409,
          error: `${describeConflict(conflicts, "they")} Reject this request, or change the group under Hierarchy first.`,
          conflict: true,
        };
      }
    }
  }

  const { data: row, error } = await supabase
    .from("leave_requests")
    .update({
      status,
      decided_by: admin.id,
      decided_at: new Date().toISOString(),
      decision_note: note,
    })
    .eq("id", id)
    .eq("organization_id", admin.organization_id)
    .eq("status", "pending")
    .select("user_id, type, start_date, end_date, days_count")
    .single();

  if (error || !row) {
    return { ok: false, status: 404, error: error?.message ?? "Request not found or already decided" };
  }

  const { data: employee } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", row.user_id)
    .single();

  // Best-effort: the decision is already saved, so an email failure
  // must not fail the response.
  try {
    if (employee) {
      // An approval puts the day off in the employee's own calendar, riding
      // along with the email they are already getting. A rejection carries
      // nothing: no event was ever created, so there is nothing to withdraw.
      const calendar = status === "approved" ? await publishApprovedLeave(id) : null;

      await emailDecisionToEmployee({
        to: employee.email,
        employeeName: employee.full_name,
        approved: status === "approved",
        typeName: await leaveTypeName(supabase, admin.organization_id, row.type),
        startDate: row.start_date,
        endDate: row.end_date,
        days: Number(row.days_count),
        note,
        calendar: calendar ?? undefined,
      });
    }
  } catch (e) {
    console.warn("[leave] decision email failed:", e);
  }

  // Set (or take down) the out-of-office auto-reply on their mailbox. Called
  // for a rejection too, not only an approval: the desired responder is always
  // recomputed from scratch, so there is no state here to get out of step.
  // Guards itself and never throws — the decision is already committed.
  await syncAfterLeaveChange(row.user_id);

  // Every admin's Slack copy of this request now says who decided it, and the
  // buttons go. Also guards itself and never throws.
  await refreshSlackApprovalMessages(id);

  return { ok: true };
}

