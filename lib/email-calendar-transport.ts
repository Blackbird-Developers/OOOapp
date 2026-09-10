import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

/**
 * The one thing Resend's HTTP API cannot do: put an iCalendar document where
 * Outlook will look for it.
 *
 * Apple Mail and Gmail will act on a `text/calendar` file attachment — they
 * sniff it, see the METHOD, and file or withdraw the event. Outlook will not.
 * Outlook only auto-processes an invitation or a cancellation when the
 * calendar document is an *alternative body part* of the message, carrying
 * `method=REQUEST` or `method=CANCEL` in its own Content-Type. Delivered as an
 * attachment it is just a file called invite.ics that somebody has to notice
 * and open, which nobody does.
 *
 * That is the whole reason approved leave never appeared in Outlook from the
 * approval email, and why cancelling removed the entry from Apple and Google
 * within seconds while Outlook sat unchanged: Outlook was only ever being fed
 * by the subscription, which refreshes on Microsoft's schedule.
 *
 * Resend's send API takes `attachments` and nothing else — there is no
 * `alternatives` and no iCalendar option — so the MIME structure Outlook needs
 * cannot be expressed through it. Resend also speaks SMTP, though, and over
 * SMTP we control the structure completely. Same provider, same API key, same
 * verified sender; only the transport differs, and only for the three emails
 * that carry a calendar.
 *
 * Nodemailer's `icalEvent` builds exactly the shape required: a
 * multipart/alternative containing the HTML and the text/calendar part, with
 * the .ics also attached by name so the clients that prefer the attachment
 * keep working as they do today. Nothing is taken away from Apple or Google to
 * give something to Outlook.
 *
 * Server-only. Never import this from a client component.
 */

const HOST = "smtp.resend.com";
// 465 with implicit TLS. Resend also offers 587 with STARTTLS; 465 is chosen
// because it is TLS from the first byte, which is one less thing to get wrong
// on a platform whose egress you do not control.
const PORT = 465;
// Resend's SMTP username is the literal string "resend" for every account —
// the API key is the password.
const USER = "resend";

let transport: Transporter | null = null;

/** Whether the SMTP path can be used at all. */
export function calendarSmtpConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/**
 * The shared transport, built once.
 *
 * `pool: false` on purpose: this runs in serverless functions that are frozen
 * between invocations, and a pooled connection held across a freeze is a
 * connection that has already been dropped by the far end. One connection per
 * send is slower and always works.
 */
function getTransport(): Transporter | null {
  if (!calendarSmtpConfigured()) return null;
  if (transport) return transport;

  transport = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user: USER, pass: process.env.RESEND_API_KEY as string },
    pool: false,
  });

  return transport;
}

export type CalendarMail = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  ics: string;
  method: "REQUEST" | "CANCEL";
};

/**
 * Send one calendar-bearing email over SMTP.
 *
 * Throws on failure rather than swallowing, so the caller can fall back to the
 * HTTP API and still get the mail out. A calendar that lands as an attachment
 * is worse than one that lands as an invitation, but it is far better than an
 * approval email that never arrives.
 */
export async function sendCalendarMailOverSmtp(mail: CalendarMail): Promise<void> {
  const tx = getTransport();
  if (!tx) throw new Error("SMTP is not configured (RESEND_API_KEY missing).");

  await tx.sendMail({
    from: mail.from,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    icalEvent: {
      method: mail.method,
      // Naming the file makes nodemailer attach it as well as inlining it, so
      // the attachment-reading clients lose nothing.
      filename: mail.method === "CANCEL" ? "cancel.ics" : "invite.ics",
      content: mail.ics,
    },
  });
}
