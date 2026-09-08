import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailDecisionToEmployee, emailCancelledRequestToAdmins } from "@/lib/email";
import { requireUser } from "@/lib/auth";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await requireUser();
  const { id } = await params;
  const supabase = await createServerClient();

  // RLS lets a user read their own requests and an admin read all, so a
  // miss here means "not yours and you're not an admin" as well as "gone".
  const { data: existing } = await supabase
    .from("leave_requests")
    .select("user_id, type, start_date, end_date, days_count, reason, status")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  // An admin acts as an admin even on their own leave, so they keep the
  // wider powers below (cancelling approved leave, notifying the employee).
  if (me.role === "admin") return cancelAsAdmin(supabase, id);

  if (existing.user_id !== me.id) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  return cancelAsOwner(id, me.id, me.full_name, existing);
}

/**
 * Admin cancellation: works on pending *or* approved leave, and tells the
 * employee their time off is gone.
 */
async function cancelAsAdmin(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  id: string
) {
  const { data: row, error } = await supabase
    .from("leave_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .in("status", ["pending", "approved"])
    .select("user_id, type, start_date, end_date, days_count")
    .single();

  if (error || !row) {
    return NextResponse.json({ error: "Request not found or already finalised" }, { status: 404 });
  }

  const { data: employee } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", row.user_id)
    .single();

  if (employee) {
    await emailDecisionToEmployee({
      to: employee.email,
      employeeName: employee.full_name,
      approved: false,
      type: row.type,
      startDate: row.start_date,
      endDate: row.end_date,
      days: Number(row.days_count),
      note: "Cancelled by admin.",
    });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Employee withdrawing their own request. Only while it is still awaiting a
 * decision — once an admin has approved it, cancelling is the admin's call,
 * so the employee has to ask.
 */
async function cancelAsOwner(
  id: string,
  userId: string,
  employeeName: string,
  existing: {
    type: "annual" | "sick";
    start_date: string;
    end_date: string;
    days_count: number;
    reason: string | null;
    status: string;
  }
) {
  if (existing.status !== "pending") {
    const message =
      existing.status === "approved"
        ? "This request has already been approved. Ask an admin to cancel it for you."
        : `This request was already ${existing.status}.`;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // RLS only permits admins to update leave_requests, so use the service-role
  // client. Ownership and status are enforced above and re-checked in the
  // filters below, which also close the gap if the row changed in between.
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("leave_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "pending")
    .select("id")
    .single();

  if (error || !row) {
    return NextResponse.json(
      { error: "This request can no longer be cancelled — an admin may have just decided it." },
      { status: 409 }
    );
  }

  // Best-effort: the cancellation is already saved, so a mail failure (e.g.
  // Resend not configured) must not fail the response.
  try {
    const { data: admins } = await admin.from("profiles").select("email").eq("role", "admin");
    const adminEmails = (admins ?? []).map((a: { email: string }) => a.email);
    if (adminEmails.length) {
      await emailCancelledRequestToAdmins({
        adminEmails,
        employeeName,
        type: existing.type,
        startDate: existing.start_date,
        endDate: existing.end_date,
        days: Number(existing.days_count),
        reason: existing.reason,
      });
    }
  } catch (e) {
    console.warn("[leave] cancellation email failed:", e);
  }

  return NextResponse.json({ ok: true });
}
