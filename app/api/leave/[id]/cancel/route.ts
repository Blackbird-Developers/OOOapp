import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { emailDecisionToEmployee } from "@/lib/email";
import { requireAdmin } from "@/lib/auth";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createServerClient();

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
