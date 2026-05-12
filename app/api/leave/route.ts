import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { countLeaveDays } from "@/lib/days";
import { emailNewRequestToAdmins, emailDecisionToEmployee } from "@/lib/email";
import { requireUser } from "@/lib/auth";

const schema = z.object({
  user_id: z.string().uuid().optional(), // admin can act on behalf
  type: z.enum(["annual", "sick"]),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  half_start: z.enum(["full", "am", "pm"]).default("full"),
  half_end: z.enum(["full", "am", "pm"]).default("full"),
  reason: z.string().max(2000).optional().nullable(),
  // If admin is creating on behalf, they can pre-approve it.
  auto_approve: z.boolean().optional(),
});

export async function POST(req: Request) {
  const me = await requireUser();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const input = parsed.data;

  if (input.end_date < input.start_date) {
    return NextResponse.json({ error: "End date must be on or after start date." }, { status: 400 });
  }

  const targetUserId = input.user_id && me.role === "admin" ? input.user_id : me.id;
  const isAdminAction = me.role === "admin" && targetUserId !== me.id;

  const supabase = await createServerClient();

  // Load holidays in range to compute working days.
  const { data: holidays } = await supabase
    .from("public_holidays")
    .select("date")
    .gte("date", input.start_date)
    .lte("date", input.end_date);
  const holidayISOs = (holidays ?? []).map((h: { date: string }) => h.date);

  const days = countLeaveDays(
    input.start_date,
    input.end_date,
    input.half_start,
    input.half_end,
    holidayISOs
  );

  if (days <= 0) {
    return NextResponse.json({ error: "Selected range contains no working days." }, { status: 400 });
  }

  const willAutoApprove = Boolean(input.auto_approve && me.role === "admin");
  const status = willAutoApprove ? "approved" : "pending";

  const insertPayload = {
    user_id: targetUserId,
    type: input.type,
    start_date: input.start_date,
    end_date: input.end_date,
    half_start: input.half_start,
    half_end: input.half_end,
    days_count: days,
    reason: input.reason ?? null,
    status,
    created_by: me.id,
    decided_by: willAutoApprove ? me.id : null,
    decided_at: willAutoApprove ? new Date().toISOString() : null,
  };

  const { data: row, error } = await supabase
    .from("leave_requests")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notifications.
  const admin = createAdminClient();
  if (willAutoApprove || isAdminAction) {
    // Notify the employee that leave was logged/approved for them.
    const { data: target } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", targetUserId)
      .single();
    if (target) {
      await emailDecisionToEmployee({
        to: target.email,
        employeeName: target.full_name,
        approved: true,
        type: input.type,
        startDate: input.start_date,
        endDate: input.end_date,
        days,
        note: "Logged by admin on your behalf.",
      });
    }
  } else {
    // Employee submitted — notify all admins.
    const { data: admins } = await admin
      .from("profiles")
      .select("email")
      .eq("role", "admin");
    const adminEmails = (admins ?? []).map((a: { email: string }) => a.email);
    if (adminEmails.length) {
      await emailNewRequestToAdmins({
        adminEmails,
        employeeName: me.full_name,
        type: input.type,
        startDate: input.start_date,
        endDate: input.end_date,
        days,
        reason: input.reason ?? null,
      });
    }
  }

  return NextResponse.json({ ok: true, id: row.id, days });
}
