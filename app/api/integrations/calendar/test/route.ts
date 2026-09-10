import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadCalendarSettings } from "@/lib/calendar-settings";
import { verifyCalendarSmtp } from "@/lib/email-calendar-transport";

export const dynamic = "force-dynamic";

/**
 * Ask the running deployment whether it can deliver calendar invitations
 * properly, rather than making somebody approve leave and go and look.
 *
 * The failure this exists to catch is silent on purpose. Invitations only file
 * themselves in Outlook when the .ics travels as an alternative body part,
 * which needs SMTP; if that path is unavailable the mailer falls back to the
 * HTTP API and attaches the file instead. The approval still arrives, so
 * nothing looks broken — Outlook simply goes back to ignoring the calendar,
 * and the only trace is a warning in the function logs.
 *
 * Connects and authenticates without sending anything, so it is safe to press
 * repeatedly and puts no test event in anyone's calendar.
 */
export async function POST() {
  await requireAdmin();

  const settings = await loadCalendarSettings();
  if (!settings.connected) {
    return NextResponse.json(
      { error: "The calendar integration isn't switched on yet." },
      { status: 503 }
    );
  }

  const smtp = await verifyCalendarSmtp();

  return NextResponse.json({
    ok: smtp.ok,
    smtp,
    // What the answer means, phrased for whoever pressed the button rather
    // than for whoever wrote the mailer.
    detail: smtp.ok
      ? "Invitations will file themselves in Outlook, Apple Calendar and Google Calendar."
      : "Invitations will still be delivered, but as an .ics attachment — Outlook won't file those on its own. Apple and Google will still work.",
  });
}
