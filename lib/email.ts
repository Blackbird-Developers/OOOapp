import { format, parseISO } from "date-fns";
import { subscribeLinks } from "@/lib/calendar-links";
import {
  calendarSmtpConfigured,
  sendCalendarMailOverSmtp,
} from "@/lib/email-calendar-transport";
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
export type CalendarAttachment = {
  ics: string;
  method: "REQUEST" | "CANCEL";
  /**
   * The recipient's own subscription feed URL, when personal feeds are switched
   * on. Present means the email may offer one-click subscribe buttons; absent
   * means say nothing, rather than advertise a feed that would answer 404.
   */
  subscribeUrl?: string;
};

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

  // Anything carrying a calendar goes over SMTP, where the .ics can be an
  // alternative body part rather than a file hanging off the message. That
  // distinction is the entire difference between Outlook filing an event and
  // Outlook showing an attachment nobody opens — see
  // lib/email-calendar-transport.ts. Every other email keeps using the HTTP
  // API, which is simpler and has nothing to gain from the change.
  if (calendar && calendarSmtpConfigured()) {
    try {
      await sendCalendarMailOverSmtp({
        from: FROM,
        to,
        subject: fullSubject,
        html,
        ics: calendar.ics,
        method: calendar.method,
      });
      return;
    } catch (e) {
      // Fall through to the API rather than lose the mail. The recipient then
      // gets the same email with the .ics attached, which is exactly where
      // this feature stood before — a worse calendar experience, not a missing
      // approval.
      console.warn("[email] calendar SMTP send failed, falling back to API:", e);
    }
  }

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

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/**
 * Dates cross this module as yyyy-MM-dd, which is the right thing to store and
 * the wrong thing to put in front of a person.
 *
 * Falls back to the raw string rather than throwing: an email that says
 * 2026-09-09 is a blemish, an email that fails to send is a bug report.
 */
function safeFormat(iso: string, pattern: string): string {
  try {
    const d = parseISO(iso);
    return Number.isNaN(d.getTime()) ? iso : format(d, pattern);
  } catch {
    return iso;
  }
}

/** "Wed 9 Sep 2026", or without the year when a range already carries it. */
function prettyDate(iso: string, opts: { year?: boolean } = {}): string {
  return safeFormat(iso, opts.year === false ? "EEE d MMM" : "EEE d MMM yyyy");
}

/** A whole booking in one phrase: "Wed 9 Sep – Fri 11 Sep 2026". */
function prettyRange(startISO: string, endISO: string): string {
  if (startISO === endISO) return prettyDate(startISO);
  const sameYear = startISO.slice(0, 4) === endISO.slice(0, 4);
  return `${prettyDate(startISO, { year: !sameYear })} – ${prettyDate(endISO)}`;
}

/**
 * Label/value rows as a table rather than a <ul>.
 *
 * Outlook renders mail through Word, which gives lists indentation and spacing
 * of its own invention; a two-column table is the one layout every client
 * agrees on. Values are inserted as HTML, so callers escape their own text.
 */
function detailTable(rows: Array<[string, string]>): string {
  const cells = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:5px 16px 5px 0;font-size:13px;line-height:20px;color:#64748b;vertical-align:top;white-space:nowrap">${label}</td>
          <td style="padding:5px 0;font-size:14px;line-height:20px;color:#0f172a;vertical-align:top">${value}</td>
        </tr>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:16px 0">${cells}</table>`;
}


/**
 * A row of link-buttons.
 *
 * Padded anchors in table cells, which is the one button every mail client
 * renders: Outlook drops <button> entirely, and a background colour on a <div>
 * survives in far fewer places than one on a <td>.
 */
function buttonRow(buttons: Array<{ href: string; label: string; primary?: boolean }>): string {
  const cells = buttons
    .map(({ href, label, primary }, i) => {
      const style = primary
        ? "background:#0f172a;border:1px solid #0f172a;color:#ffffff"
        : "background:#ffffff;border:1px solid #cbd5e1;color:#0f172a";
      return `<td style="padding:0 ${i === buttons.length - 1 ? "0" : "8px"} 0 0">
        <a href="${href}" style="display:inline-block;${style};font-size:13px;font-weight:600;line-height:18px;padding:9px 14px;border-radius:8px;text-decoration:none">${label}</a>
      </td>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr>${cells}</tr></table>`;
}

/**
 * The one-click subscribe buttons, plus the URL in plain sight.
 *
 * Apple, Google and Outlook each get a button. Every href is an ordinary
 * https link back to this app, which redirects to the vendor after the click —
 * see lib/calendar-links.ts. Linking to `webcal://` directly is what mail
 * clients strip, and it is why the Apple button used to do nothing here while
 * working perfectly on the account page.
 *
 * The Outlook button goes to the work-or-school host, which is the one a
 * company leave tracker overwhelmingly lands on. Personal Outlook.com accounts
 * live on a different host that cannot be detected from here, so they get a
 * named text link rather than a button that would send the majority to a
 * sign-in page for an account they do not have.
 */
function subscribeBlock(feedUrl: string, opts: { showAddress: boolean }): string {
  const links = subscribeLinks(feedUrl);

  const personal = `<a href="${links.outlookPersonal}" style="color:#6366f1;text-decoration:none">personal Outlook.com account</a>`;

  // The raw address earns its space in the one-off setup email, where somebody
  // is sitting down to do this. Repeating it in every approval for the rest of
  // their employment would just be a wall of hex under a day off.
  const address = opts.showAddress
    ? `<p style="margin:12px 0 0;font-size:12px;line-height:18px;color:#64748b">
         Got a ${personal}? Use that link instead. To add it by hand anywhere
         else (Add calendar &rarr; Subscribe from web):<br />
         <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:#334155;word-break:break-all">${feedUrl}</span>
       </p>`
    : `<p style="margin:10px 0 0;font-size:12px;line-height:18px;color:#64748b">
         Got a ${personal}? Use that link instead. Every option, and the
         address to paste by hand, is on
         <a href="${SITE}/dashboard/account" style="color:#6366f1">your account page</a>.
       </p>`;

  return `
    ${buttonRow([
      { href: links.apple, label: "Apple Calendar", primary: true },
      { href: links.google, label: "Google Calendar" },
      { href: links.outlook, label: "Outlook / Teams" },
    ])}
    ${address}`;
}

/** The month and day for the little calendar tile, if the date is usable. */
function tileParts(iso: string): { month: string; day: string } | null {
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return null;
    return { month: format(d, "MMM").toUpperCase(), day: format(d, "d") };
  } catch {
    return null;
  }
}

/**
 * The calendar block: the loudest thing in the email after the decision.
 *
 * An integration nobody notices is an integration nobody trusts, so this names
 * the apps the entry actually lands in instead of describing a file. "An
 * out-of-office entry is attached" reads like a chore left for the reader;
 * "it's already in your Google Calendar" reads like the work is done — which
 * is the true version, since the .ics carries METHOD:REQUEST and every major
 * client files it without being asked.
 *
 * Tables and inline styles throughout, no flexbox and no stylesheet: Outlook
 * renders mail through Word, which honours almost nothing a browser would.
 */
function calendarPanel(opts: {
  method: "REQUEST" | "CANCEL";
  startDate: string;
  endDate: string;
  subscribeUrl?: string;
}): string {
  const added = opts.method === "REQUEST";
  // Indigo for a booking that now exists, slate for one that has gone. The
  // colour is the fastest signal in the email of which of the two happened.
  const accent = added ? "#6366f1" : "#94a3b8";
  const heading = added ? "Added to your calendar" : "Removed from your calendar";
  const file = added ? "invite.ics" : "cancel.ics";

  const apps =
    "<strong>Google&nbsp;Calendar</strong>, <strong>Apple&nbsp;Calendar</strong> and <strong>Outlook&nbsp;/&nbsp;Teams</strong>";

  const explanation = added
    ? `The <strong>${file}</strong> attached to this email is what puts it there — ${apps} all
       file it on their own. If yours asks first, open the attachment once and it&rsquo;s in.`
    : `The <strong>${file}</strong> attached to this email clears it from ${apps}. If the entry
       is still showing, open the attachment once and it will go.`;

  // Offered on an approval only. A withdrawal is telling somebody their day
  // off has gone, which is the wrong moment to sell them a feature.
  const subscribe =
    added && opts.subscribeUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:14px 0 0">
           <tr><td style="border-top:1px solid #e2e8f0;padding:14px 0 0">
             <p style="margin:0 0 10px;font-size:13px;line-height:19px;color:#475569">
               <strong style="color:#0f172a">Set it up once and never open an attachment again.</strong>
               Subscribe your calendar and every approved booking lands on its own.
             </p>
             ${subscribeBlock(opts.subscribeUrl, { showAddress: false })}
           </td></tr>
         </table>`
      : "";

  const tile = tileParts(opts.startDate);
  const tileCell = tile
    ? `<td width="46" valign="top" style="width:46px;padding-right:14px">
         <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="46" style="width:46px;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;background:#ffffff">
           <tr>
             <td align="center" bgcolor="${accent}" style="background:${accent};border-radius:7px 7px 0 0;color:#ffffff;font-size:10px;line-height:14px;font-weight:700;letter-spacing:1px;padding:3px 0">${tile.month}</td>
           </tr>
           <tr>
             <td align="center" style="color:#0f172a;font-size:20px;line-height:24px;font-weight:700;padding:5px 0 7px">${tile.day}</td>
           </tr>
         </table>
       </td>`
    : "";

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:20px 0">
      <tr>
        <td style="background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid ${accent};border-radius:10px;padding:16px 18px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              ${tileCell}
              <td valign="top">
                <p style="margin:0;font-size:15px;line-height:20px;font-weight:600;color:#0f172a">${heading}</p>
                <p style="margin:5px 0 0;font-size:13px;line-height:19px;color:#334155">Shows as &ldquo;Out of office&rdquo; &middot; ${prettyRange(opts.startDate, opts.endDate)}</p>
              </td>
            </tr>
          </table>
          <p style="margin:14px 0 0;font-size:13px;line-height:20px;color:#475569">${explanation}</p>
          ${subscribe}
        </td>
      </tr>
    </table>`;
}

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

  const rows: Array<[string, string]> = [
    ["Dates", prettyRange(opts.startDate, opts.endDate)],
    ["Days", `${opts.days} ${opts.days === 1 ? "day" : "days"}`],
  ];
  if (opts.note) rows.push(["Note from admin", escapeHtml(opts.note)]);

  const body = `
    <p style="margin:0 0 12px;font-size:14px;line-height:21px">Hi ${escapeHtml(opts.employeeName)},</p>
    <p style="margin:0;font-size:14px;line-height:21px">Your ${opts.type} leave request has been <strong style="color:${color}">${verb}</strong>.</p>
    ${detailTable(rows)}
    ${
      opts.calendar
        ? calendarPanel({
            method: opts.calendar.method,
            startDate: opts.startDate,
            endDate: opts.endDate,
            subscribeUrl: opts.calendar.subscribeUrl,
          })
        : ""
    }
    <p style="margin:16px 0 0;font-size:14px"><a href="${SITE}/dashboard" style="color:#6366f1">View your dashboard</a></p>
  `;
  await send(
    opts.to,
    `Leave ${verb}: ${prettyRange(opts.startDate, opts.endDate)}`,
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
    <p style="margin:0 0 12px;font-size:14px;line-height:21px">Hi ${escapeHtml(opts.employeeName)},</p>
    <p style="margin:0;font-size:14px;line-height:21px">
      You changed leave that had already been approved, so it is waiting on an admin again — and
      the out-of-office entry has come off your calendar in the meantime.
    </p>
    ${calendarPanel({
      method: "CANCEL",
      startDate: opts.startDate,
      endDate: opts.endDate,
    })}
    <p style="margin:0;font-size:13px;line-height:20px;color:#475569">
      A fresh calendar entry goes out as soon as the new dates are approved.
    </p>
    <p style="margin:16px 0 0;font-size:14px"><a href="${SITE}/dashboard/my-requests" style="color:#6366f1">View your requests</a></p>
  `;
  await send(
    opts.to,
    `Calendar entry removed while your change is reviewed`,
    wrap(body),
    opts.calendar
  );
}


/**
 * Day one: connect your calendar, once, forever.
 *
 * Sent right after somebody accepts their invite rather than inside the invite
 * itself — the profile that owns a feed token does not exist until acceptance,
 * so there is no URL to put in the invitation. This is the email that makes
 * every later approval arrive without an attachment to open.
 */
export async function emailCalendarSetup(opts: {
  to: string;
  fullName: string;
  feedUrl: string;
}) {
  const body = `
    <p style="margin:0 0 12px;font-size:14px;line-height:21px">Hi ${escapeHtml(opts.fullName)},</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:21px">
      Your account is ready. One last thing worth doing now: connect your calendar, and every
      leave request that gets approved will appear in it on its own — no attachment to open, and
      cancelled days clear themselves out again.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 16px">
      <tr>
        <td style="background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #6366f1;border-radius:10px;padding:16px 18px">
          <p style="margin:0 0 12px;font-size:15px;line-height:20px;font-weight:600;color:#0f172a">Your out-of-office calendar</p>
          ${subscribeBlock(opts.feedUrl, { showAddress: true })}
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:12px;line-height:18px;color:#64748b">
      That address is personal to you — anyone holding it can see when you&rsquo;re off, so treat it
      like a password. You can replace it at any time from
      <a href="${SITE}/dashboard/account" style="color:#6366f1">your account page</a>, which stops
      the old one working immediately.
    </p>
  `;
  await send(opts.to, "Connect your calendar", wrap(body));
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
