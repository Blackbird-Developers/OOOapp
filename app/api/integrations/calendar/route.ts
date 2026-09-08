import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { saveCalendarSettings, type CalendarSettingsPatch } from "@/lib/calendar-settings";

export const dynamic = "force-dynamic";

/**
 * Switch the calendar integration on, reconfigure it, and switch it off.
 *
 * Shorter than its Slack neighbour for one reason: there is no credential to
 * accept, verify or protect. iCalendar invitations are delivered over the mail
 * transport the app already has, so connecting is a decision rather than a
 * handshake.
 */

/** Connect: start putting approved leave in people's calendars. */
export async function POST() {
  const admin = await requireAdmin();

  const { error } = await saveCalendarSettings({ connected: true }, admin.id);
  if (error) return NextResponse.json({ error: saveFailed(error) }, { status: 500 });

  return NextResponse.json({ ok: true });
}

const updateSchema = z
  .object({
    send_invites: z.boolean().optional(),
    personal_feeds: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

/** Edit which of the two delivery routes are in use. */
export async function PATCH(req: Request) {
  const admin = await requireAdmin();

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);

  const patch: CalendarSettingsPatch = {
    sendInvites: parsed.data.send_invites,
    personalFeeds: parsed.data.personal_feeds,
  };

  const { error } = await saveCalendarSettings(patch, admin.id);
  if (error) return NextResponse.json({ error: saveFailed(error) }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/**
 * Disconnect: stop sending invitations and stop serving feeds.
 *
 * Entries already filed in somebody's calendar are deliberately left alone.
 * Mass-cancelling every future booking across the company is not something a
 * single click should be able to do, and the leave itself has not changed —
 * only the app's willingness to keep announcing it. Feed URLs stop resolving
 * immediately, so subscribed calendars simply stop updating.
 */
export async function DELETE() {
  const admin = await requireAdmin();

  const { error } = await saveCalendarSettings({ connected: false }, admin.id);
  if (error) return NextResponse.json({ error: saveFailed(error) }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/** Surface the field message zod produced, rather than a flat "Invalid input". */
function badRequest(error: z.ZodError): NextResponse {
  const message = error.issues[0]?.message ?? "Invalid input";
  return NextResponse.json({ error: message }, { status: 400 });
}

function saveFailed(error: string): string {
  // The most likely cause by far is migration 010 not having been run yet.
  return `Couldn't save the settings (${error}). If this is a fresh deploy, run supabase/migrations/010_calendar_integration.sql.`;
}
