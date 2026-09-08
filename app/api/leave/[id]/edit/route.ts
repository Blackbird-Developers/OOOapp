import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, format, parseISO } from "date-fns";
import { countLeaveDays, todayISOIn } from "@/lib/days";
import { getAnnualMinNoticeDays, formatNoticeDays } from "@/lib/settings";
import { getBalance } from "@/lib/balances";
import { emailEditedRequestToAdmins } from "@/lib/email";
import { findAnnualConflicts, describeConflict } from "@/lib/conflicts";
import { requireUser } from "@/lib/auth";
import { withdrawCalendarEvent } from "@/lib/calendar";

const schema = z.object({
  type: z.enum(["annual", "sick"]),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  half_start: z.enum(["full", "am", "pm"]).default("full"),
  half_end: z.enum(["full", "am", "pm"]).default("full"),
  reason: z.string().max(2000).optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const input = parsed.data;

  if (input.end_date < input.start_date) {
    return NextResponse.json({ error: "End date must be on or after start date." }, { status: 400 });
  }

  const supabase = await createServerClient();

  // Load the request being edited and confirm it belongs to the caller.
  const { data: existing } = await supabase
    .from("leave_requests")
    .select("user_id, type, start_date, end_date, half_start, half_end, days_count, reason, status")
    .eq("id", id)
    .single();

  if (!existing || existing.user_id !== me.id) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  if (existing.status !== "pending" && existing.status !== "approved") {
    return NextResponse.json(
      { error: "Only pending or approved requests can be edited." },
      { status: 400 }
    );
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  if (existing.start_date < todayISO) {
    return NextResponse.json(
      { error: "This leave has already started and can no longer be edited." },
      { status: 400 }
    );
  }
  if (input.start_date < todayISO) {
    return NextResponse.json(
      { error: "You can't move leave to dates that have already passed." },
      { status: 400 }
    );
  }

  // Notice-period policy: moving annual leave to different dates counts as a
  // new request, so the same minimum-notice rule applies. Edits that keep the
  // dates (e.g. changing the reason) are not blocked, and admins are exempt.
  const datesChanged =
    input.start_date !== existing.start_date || input.end_date !== existing.end_date;
  if (me.role !== "admin" && input.type === "annual" && datesChanged) {
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

  // Recompute working days over the new range.
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

  // Block overlap with the user's other active requests (exclude this one).
  const { data: overlapping } = await supabase
    .from("leave_requests")
    .select("start_date, end_date")
    .eq("user_id", me.id)
    .neq("id", id)
    .in("status", ["approved", "pending"])
    .lte("start_date", input.end_date)
    .gte("end_date", input.start_date);

  if (overlapping && overlapping.length > 0) {
    const o = overlapping[0];
    const sameRow = o.start_date === o.end_date;
    return NextResponse.json(
      {
        error: sameRow
          ? `This overlaps another request for ${o.start_date}.`
          : `This overlaps another request (${o.start_date} → ${o.end_date}).`,
      },
      { status: 400 }
    );
  }

  // Hierarchy rule: annual leave can't overlap a conflict-group mate's
  // approved or pending annual leave.
  if (input.type === "annual") {
    const conflicts = await findAnnualConflicts({
      userId: me.id,
      startDate: input.start_date,
      endDate: input.end_date,
      excludeRequestId: id,
    });
    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: describeConflict(conflicts, "you"), conflict: true },
        { status: 409 }
      );
    }
  }

  // Re-check balance. The request being edited is already counted in the
  // balance, so add its current days back to the matching type before testing
  // the new size. If the type changed, the old days were counted against the
  // old type and don't affect the new type's remaining.
  const balance = await getBalance(me.id);
  let remaining = input.type === "annual" ? balance.annual_remaining : balance.sick_remaining;
  if (existing.type === input.type) remaining = +(remaining + Number(existing.days_count)).toFixed(1);
  if (days > remaining) {
    const noun = input.type === "annual" ? "annual leave" : "sick leave";
    return NextResponse.json(
      {
        error:
          remaining <= 0
            ? `You have no ${noun} days left this year.`
            : `You only have ${remaining} ${noun} day${remaining === 1 ? "" : "s"} available. This request is ${days} day${days === 1 ? "" : "s"}.`,
      },
      { status: 400 }
    );
  }

  // Editing always sends the request back to pending for re-approval. RLS only
  // permits admins to update leave_requests, so use the service-role client;
  // ownership and status are already enforced above and in the filters below.
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("leave_requests")
    .update({
      type: input.type,
      start_date: input.start_date,
      end_date: input.end_date,
      half_start: input.half_start,
      half_end: input.half_end,
      days_count: days,
      reason: input.reason ?? null,
      status: "pending",
      decided_by: null,
      decided_at: null,
      decision_note: null,
    })
    .eq("id", id)
    .eq("user_id", me.id)
    .in("status", ["pending", "approved"])
    .select("id")
    .single();

  if (error || !row) {
    return NextResponse.json({ error: error?.message ?? "Could not update request." }, { status: 500 });
  }

  // Editing approved leave sends it back to pending, so the day off already
  // sitting in the employee's calendar is no longer true and has to come out
  // now. Waiting for a re-approval that may never arrive would leave them
  // blocked out for dates nobody has agreed to.
  if (existing.status === "approved") {
    // The dates the entry was actually filed under — the row already carries
    // the new ones by this point.
    await withdrawCalendarEvent(id, {
      startDate: existing.start_date,
      endDate: existing.end_date,
    });
  }

  // Notify all admins of the change. Best-effort: the edit is already saved,
  // so an email failure must not fail the response.
  try {
    await notifyAdminsOfEdit(admin, me.full_name, existing, input, days);
  } catch (e) {
    console.warn("[leave] edit email failed:", e);
  }

  return NextResponse.json({ ok: true, id: row.id, days });
}

async function notifyAdminsOfEdit(
  admin: ReturnType<typeof createAdminClient>,
  employeeName: string,
  existing: {
    type: "annual" | "sick";
    start_date: string;
    end_date: string;
    days_count: number;
    reason: string | null;
    status: string;
  },
  input: {
    type: "annual" | "sick";
    start_date: string;
    end_date: string;
    reason?: string | null;
  },
  days: number
) {
  const { data: admins } = await admin.from("profiles").select("email").eq("role", "admin");
  const adminEmails = (admins ?? []).map((a: { email: string }) => a.email);
  if (adminEmails.length) {
    await emailEditedRequestToAdmins({
      adminEmails,
      employeeName,
      wasApproved: existing.status === "approved",
      before: {
        type: existing.type,
        startDate: existing.start_date,
        endDate: existing.end_date,
        days: Number(existing.days_count),
        reason: existing.reason,
      },
      after: {
        type: input.type,
        startDate: input.start_date,
        endDate: input.end_date,
        days,
        reason: input.reason ?? null,
      },
    });
  }
}
