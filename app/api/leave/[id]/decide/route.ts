import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { emailDecisionToEmployee } from "@/lib/email";
import { requireAdmin } from "@/lib/auth";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().max(1000).optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const supabase = await createServerClient();
  const status = parsed.data.action === "approve" ? "approved" : "rejected";

  const { data: row, error } = await supabase
    .from("leave_requests")
    .update({
      status,
      decided_by: admin.id,
      decided_at: new Date().toISOString(),
      decision_note: parsed.data.note ?? null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("user_id, type, start_date, end_date, days_count")
    .single();

  if (error || !row) {
    return NextResponse.json({ error: error?.message ?? "Request not found or already decided" }, { status: 404 });
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
      approved: status === "approved",
      type: row.type,
      startDate: row.start_date,
      endDate: row.end_date,
      days: Number(row.days_count),
      note: parsed.data.note ?? null,
    });
  }

  return NextResponse.json({ ok: true });
}
