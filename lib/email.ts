import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM ?? "BBM Leave <onboarding@resend.dev>";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

async function send(to: string | string[], subject: string, html: string) {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping email:", subject);
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error("[email] send failed:", err);
  }
}

const wrap = (body: string) => `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <h2 style="margin:0 0 16px;color:#0f172a">BBM Leave</h2>
  ${body}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
  <p style="font-size:12px;color:#64748b;margin:0">Blackbird Marketing leave tracker · <a href="${SITE}" style="color:#6366f1">Open dashboard</a></p>
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
  await send(opts.adminEmails, `Leave request — ${opts.employeeName} (${opts.days}d)`, wrap(body));
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
}) {
  const verb = opts.approved ? "approved" : "rejected";
  const color = opts.approved ? "#059669" : "#dc2626";
  const body = `
    <p>Hi ${escapeHtml(opts.employeeName)},</p>
    <p>Your ${opts.type} leave request has been <strong style="color:${color}">${verb}</strong>.</p>
    <ul>
      <li><strong>Dates:</strong> ${opts.startDate} → ${opts.endDate}</li>
      <li><strong>Days:</strong> ${opts.days}</li>
      ${opts.note ? `<li><strong>Note from admin:</strong> ${escapeHtml(opts.note)}</li>` : ""}
    </ul>
    <p><a href="${SITE}/dashboard" style="color:#6366f1">View your dashboard</a></p>
  `;
  await send(opts.to, `Leave ${verb} — ${opts.startDate} → ${opts.endDate}`, wrap(body));
}

export async function emailInvite(opts: {
  to: string;
  fullName: string;
  token: string;
}) {
  const url = `${SITE}/invite/${opts.token}`;
  const body = `
    <p>Hi ${escapeHtml(opts.fullName)},</p>
    <p>You've been invited to join the Blackbird Marketing leave tracker.</p>
    <p><a href="${url}" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Accept invite & set password</a></p>
    <p style="font-size:12px;color:#64748b">This link expires in 7 days.</p>
  `;
  await send(opts.to, "You're invited to BBM Leave", wrap(body));
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
