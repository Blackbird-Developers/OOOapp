import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM ?? "Blackbird Leave <onboarding@resend.dev>";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SUBJECT_PREFIX = "Blackbird Leave";

/**
 * An iCalendar document travelling with an email.
 *
 * The `method` is not decoration: it is what tells Gmail, Outlook and Apple
 * Mail to treat the attachment as an invitation to file rather than a
 * document to download, and it has to agree with the METHOD line inside the
 * body of the .ics itself.
 */
export type CalendarAttachment = { ics: string; method: "REQUEST" | "CANCEL" };

function calendarAttachment(cal: CalendarAttachment) {
  return {
    filename: cal.method === "CANCEL" ? "cancel.ics" : "invite.ics",
    content: Buffer.from(cal.ics, "utf8").toString("base64"),
    // Spelling this out rather than letting Resend infer text/calendar from
    // the .ics extension. Without the method parameter the major clients fall
    // back to showing a downloadable file, which is exactly the manual step
    // this feature exists to remove.
    contentType: `text/calendar; charset=utf-8; method=${cal.method}`,
  };
}

async function send(
  to: string | string[],
  subject: string,
  html: string,
  calendar?: CalendarAttachment
) {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set; skipping email:", subject);
    throw new Error("Email is not configured (RESEND_API_KEY missing).");
  }
  const fullSubject = `${SUBJECT_PREFIX}: ${subject}`;
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: fullSubject,
    html,
    ...(calendar ? { attachments: [calendarAttachment(calendar)] } : {}),
  });
  if (error) {
    // Resend returns errors in the response body rather than throwing.
    console.error("[email] send failed:", error);
    throw new Error(error.message || "Email provider rejected the send.");
  }
}

const wrap = (body: string) => `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <h2 style="margin:0 0 16px;color:#0f172a">Blackbird Leave</h2>
  ${body}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
  <p style="font-size:12px;color:#64748b;margin:0">Blackbird Leave · <a href="${SITE}" style="color:#6366f1">Open dashboard</a></p>
</div>
`;

export async function emailNewRequestToAdmins(opts: {
  adminEmails: string[];
  employeeName: string;
  type: "annual" | "sick";
  startDate: string;
  endDate: string;
  days: number;
  reason?: string | null;
}) {
  const body = `
    <p><strong>${opts.employeeName}</strong> requested ${opts.type} leave.</p>
    <ul>
      <li><strong>Dates:</strong> ${opts.startDate} → ${opts.endDate}</li>
      <li><strong>Days:</strong> ${opts.days}</li>
      ${opts.reason ? `<li><strong>Reason:</strong> ${escapeHtml(opts.reason)}</li>` : ""}
    </ul>
    <p><a href="${SITE}/admin" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Review in dashboard</a></p>
  `;
  await send(opts.adminEmails, `Leave request from ${opts.employeeName} (${opts.days}d)`, wrap(body));
}

export async function emailEditedRequestToAdmins(opts: {
  adminEmails: string[];
  employeeName: string;
  wasApproved: boolean;
  before: { type: "annual" | "sick"; startDate: string; endDate: string; days: number; reason?: string | null };
  after: { type: "annual" | "sick"; startDate: string; endDate: string; days: number; reason?: string | null };
}) {
  const changed = (a: string | number, b: string | number) =>
    a === b
      ? `${escapeHtml(String(b))}`
      : `<s style="color:#94a3b8">${escapeHtml(String(a))}</s> → <strong>${escapeHtml(String(b))}</strong>`;

  const { before, after } = opts;
  const body = `
    <p><strong>${escapeHtml(opts.employeeName)}</strong> edited a leave request.</p>
    ${
      opts.wasApproved
        ? `<p style="color:#b45309"><strong>This request was already approved.</strong> It has been reset to <strong>pending</strong> and needs your re-approval.</p>`
        : ""
    }
    <ul>
      <li><strong>Type:</strong> ${changed(before.type, after.type)}</li>
      <li><strong>Dates:</strong> ${changed(`${before.startDate} → ${before.endDate}`, `${after.startDate} → ${after.endDate}`)}</li>
      <li><strong>Days:</strong> ${changed(before.days, after.days)}</li>
      <li><strong>Reason:</strong> ${changed(before.reason || "—", after.reason || "—")}</li>
    </ul>
    <p><a href="${SITE}/admin" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Review in dashboard</a></p>
  `;
  await send(opts.adminEmails, `Leave request edited by ${opts.employeeName} (${after.days}d)`, wrap(body));
}

export async function emailCancelledRequestToAdmins(opts: {
  adminEmails: string[];
  employeeName: string;
  type: "annual" | "sick";
  startDate: string;
  endDate: string;
  days: number;
  reason?: string | null;
}) {
  const body = `
    <p><strong>${escapeHtml(opts.employeeName)}</strong> cancelled their pending ${opts.type} leave request.</p>
    <p>No decision is needed — it has been removed from your queue.</p>
    <ul>
      <li><strong>Dates:</strong> ${opts.startDate} &rarr; ${opts.endDate}</li>
      <li><strong>Days:</strong> ${opts.days}</li>
      ${opts.reason ? `<li><strong>Original reason:</strong> ${escapeHtml(opts.reason)}</li>` : ""}
    </ul>
    <p><a href="${SITE}/admin" style="color:#6366f1">View requests</a></p>
  `;
  await send(
    opts.adminEmails,
    `Leave request cancelled by ${opts.employeeName} (${opts.days}d)`,
    wrap(body)
  );
}

export async function emailDecisionToEmployee(opts: {
  to: string;
  employeeName: string;
  approved: boolean;
  type: "annual" | "sick";
  startDate: string;
  endDate: string;
  days: number;
  note?: string | null;
  /**
   * Rides along with the decision the employee is already being told about,
   * rather than arriving as a second email. An approval carries a REQUEST
   * that files the day off; an admin cancelling approved leave carries a
   * CANCEL that takes it back out.
   */
  calendar?: CalendarAttachment;
}) {
  const verb = opts.approved ? "approved" : "rejected";
  const color = opts.approved ? "#059669" : "#dc2626";
  const calendarNote = opts.calendar
    ? opts.calendar.method === "REQUEST"
      ? `<p style="font-size:13px;color:#475569">An out-of-office entry is attached. Most calendar apps add it automatically — if yours asks, open the attachment once and it will appear in Google Calendar, Outlook, Teams or Apple Calendar.</p>`
      : `<p style="font-size:13px;color:#475569">The matching entry has been removed from your calendar. If it is still showing, open the attachment once to clear it.</p>`
    : "";
  const body = `
    <p>Hi ${escapeHtml(opts.employeeName)},</p>
    <p>Your ${opts.type} leave request has been <strong style="color:${color}">${verb}</strong>.</p>
    <ul>
      <li><strong>Dates:</strong> ${opts.startDate} → ${opts.endDate}</li>
      <li><strong>Days:</strong> ${opts.days}</li>
      ${opts.note ? `<li><strong>Note from admin:</strong> ${escapeHtml(opts.note)}</li>` : ""}
    </ul>
    ${calendarNote}
    <p><a href="${SITE}/dashboard" style="color:#6366f1">View your dashboard</a></p>
  `;
  await send(
    opts.to,
    `Leave ${verb}: ${opts.startDate} to ${opts.endDate}`,
    wrap(body),
    opts.calendar
  );
}

/**
 * Withdraw a calendar entry when there is no decision email to attach it to.
 *
 * The one case: an employee edits their own already-approved leave. That sends
 * the request back to pending, so the day off in their calendar is no longer
 * true and has to come out immediately — waiting for a re-approval that might
 * never come would leave a phantom block on their availability.
 */
export async function emailCalendarWithdrawn(opts: {
  to: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  calendar: CalendarAttachment;
}) {
  const body = `
    <p>Hi ${escapeHtml(opts.employeeName)},</p>
    <p>
      You changed leave that had already been approved, so it is waiting on an
      admin again. The out-of-office entry for
      <strong>${opts.startDate} → ${opts.endDate}</strong> has been taken off your calendar in
      the meantime.
    </p>
    <p style="font-size:13px;color:#475569">
      You will get a fresh calendar entry as soon as the new dates are approved.
    </p>
    <p><a href="${SITE}/dashboard/my-requests" style="color:#6366f1">View your requests</a></p>
  `;
  await send(
    opts.to,
    `Calendar entry removed while your change is reviewed`,
    wrap(body),
    opts.calendar
  );
}

export async function emailInvite(opts: {
  to: string;
  fullName: string;
  token: string;
}) {
  const url = `${SITE}/invite/${opts.token}`;
  const body = `
    <p>Hi ${escapeHtml(opts.fullName)},</p>
    <p>You've been invited to join Blackbird Leave.</p>
    <p><a href="${url}" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Accept invite & set password</a></p>
    <p style="font-size:12px;color:#64748b">This link expires in 7 days.</p>
  `;
  await send(opts.to, "You're invited", wrap(body));
}

export async function emailPasswordReset(opts: {
  to: string;
  fullName: string;
  token: string;
}) {
  const url = `${SITE}/reset-password/${opts.token}`;
  const body = `
    <p>Hi ${escapeHtml(opts.fullName)},</p>
    <p>We received a request to reset the password on your Blackbird Leave account.</p>
    <p><a href="${url}" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Choose a new password</a></p>
    <p style="font-size:12px;color:#64748b">This link expires in 1 hour. If you didn't request this, you can safely ignore the email — your password won't change.</p>
  `;
  await send(opts.to, "Reset your password", wrap(body));
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
