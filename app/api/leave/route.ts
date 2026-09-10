import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, format, parseISO } from "date-fns";
import { countLeaveDays, todayISOIn } from "@/lib/days";
import { getAnnualMinNoticeDays, formatNoticeDays } from "@/lib/settings";
import { getBalance } from "@/lib/balances";
import { emailNewRequestToAdmins, emailDecisionToEmployee } from "@/lib/email";
import { findAnnualConflicts, describeConflict } from "@/lib/conflicts";
import { requireUser } from "@/lib/auth";
import { publishApprovedLeave } from "@/lib/calendar";

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
  // Admin-only: log leave even though it clashes with a conflict group.
  override_conflicts: z.boolean().optional(),
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

  // Employees can't book past dates. Admins can backfill missed entries —
  // for anyone, including their own leave — so later checks (like a
  // hierarchy conflict) surface instead of a blanket past-dates error.
  if (me.role !== "admin") {
    const todayISO = new Date().toISOString().slice(0, 10);
    if (input.start_date < todayISO) {
      return NextResponse.json(
        { error: "You can't request leave for dates that have already passed." },
        { status: 400 }
      );
    }
  }

  // Notice-period policy: employees must request annual leave at least
  // N calendar days before it starts (admin-configured under Settings).
  // Admins are exempt; sick leave is inherently last-minute and never
  // restricted.
  if (me.role !== "admin" && input.type === "annual") {
    const minNotice = await getAnnualMinNoticeDays();
    if (minNotice > 0) {
      const earliest = format(addDays(parseISO(todayISOIn()), minNotice), "yyyy-MM-dd");
      if (input.start_date < earliest) {
        return NextResponse.json(
          {
            error: `Annual leave must be requested at least ${formatNoticeDays(minNotice)} in advance. The earliest start date you can request is ${earliest}.`,
          },
          { status: 400 }
        );
      }
    }
  }

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

  // Block double-booking: any existing approved or pending leave that
  // overlaps the new range, for the same user.
  const { data: overlapping } = await supabase
    .from("leave_requests")
    .select("start_date, end_date, status")
    .eq("user_id", targetUserId)
    .in("status", ["approved", "pending"])
    .lte("start_date", input.end_date)
    .gte("end_date", input.start_date);

  if (overlapping && overlapping.length > 0) {
    const o = overlapping[0];
    const clash =
      o.start_date === o.end_date
        ? `${isAdminAction ? "They" : "You"} already have a leave request for ${o.start_date}.`
        : `${isAdminAction ? "Their" : "Your"} selection overlaps an existing request (${o.start_date} → ${o.end_date}).`;
    // Point at the fix that actually exists: an employee can withdraw their own
    // request while it's still pending, but approved leave has to go back
    // through an admin.
    const fix = isAdminAction
      ? "Cancel it from the admin requests page first if you want to change it."
      : o.status === "pending"
        ? "Cancel it under My requests first if you want to change it."
        : "Edit it under My requests, or ask an admin to cancel it.";
    return NextResponse.json({ error: `${clash} ${fix}` }, { status: 400 });
  }

  // Hierarchy rule: annual leave can't overlap a conflict-group mate's
  // approved or pending annual leave. Admins can override explicitly.
  const canOverride = Boolean(input.override_conflicts && me.role === "admin");
  if (input.type === "annual" && !canOverride) {
    const conflicts = await findAnnualConflicts({
      userId: targetUserId,
      startDate: input.start_date,
      endDate: input.end_date,
    });
    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: describeConflict(conflicts, isAdminAction ? "they" : "you"), conflict: true },
        { status: 409 }
      );
    }
  }

  const willAutoApprove = Boolean(input.auto_approve && me.role === "admin");
  const status = willAutoApprove ? "approved" : "pending";

  // Enforce remaining balance for employee self-requests. Admins acting on
  // behalf can override (the auto_approve/isAdminAction paths). Balance
  // counts both approved and pending leave against the allowance.
  if (!willAutoApprove && !isAdminAction) {
    const balance = await getBalance(targetUserId);
    const remaining = input.type === "annual" ? balance.annual_remaining : balance.sick_remaining;
    if (days > remaining) {
      const noun = input.type === "annual" ? "annual leave" : "sick leave";
      return NextResponse.json(
        {
          error:
            remaining <= 0
              ? `You have no ${noun} days left this year.`
              : `You only have ${remaining} ${noun} day${remaining === 1 ? "" : "s"} left. This request is ${days} day${days === 1 ? "" : "s"}.`,
        },
        { status: 400 }
      );
    }
  }

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

  // Notifications are best-effort: the request is already saved, so an email
  // failure (e.g. Resend not configured) must not fail the response.
  try {
    const admin = createAdminClient();
    if (willAutoApprove || isAdminAction) {
      // Notify the employee that leave was logged/approved for them.
      const { data: target } = await admin
        .from("profiles")
        .select("email, full_name")
        .eq("id", targetUserId)
        .single();
      if (target) {
        // Leave an admin pre-approves never passes through the decide route,
        // so the calendar entry has to be attached here too — otherwise the
        // most common way an admin books time off for somebody would be the
        // one path that silently skipped their calendar.
        //
        // Gated on willAutoApprove rather than the branch condition: an admin
        // logging leave that still needs approval leaves a *pending* row, and
        // only an approved day off belongs in a calendar.
        const calendar = willAutoApprove ? await publishApprovedLeave(row.id) : null;

        await emailDecisionToEmployee({
          to: target.email,
          employeeName: target.full_name,
          approved: true,
          type: input.type,
          startDate: input.start_date,
          endDate: input.end_date,
          days,
          note: "Logged by admin on your behalf.",
          calendar: calendar ?? undefined,
        });
      }
    } else {
      // Employee submitted: notify all admins.
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
  } catch (e) {
    console.warn("[leave] notification email failed:", e);
  }

  return NextResponse.json({ ok: true, id: row.id, days });
}
