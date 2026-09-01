import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { verifySlackToken } from "@/lib/slack";
import { saveSlackSettings, type SlackSettingsPatch } from "@/lib/slack-settings";

export const dynamic = "force-dynamic";

/**
 * Connect, reconfigure and disconnect Slack from inside the app.
 *
 * The bot token only ever travels inwards: it is accepted here, checked
 * against Slack, and written to a table the anon key can't read. No handler in
 * this file returns it, not even masked.
 */

// Slack channel IDs are C… (public), G… (private) or D… (DM). Checking the
// shape here turns the most common mistake — pasting "#out-of-office" instead
// of the ID — into a field error rather than a channel_not_found at 06:00.
const channelId = z
  .string()
  .trim()
  .regex(/^[CGD][A-Z0-9]{6,}$/i, "That doesn't look like a channel ID. It looks like C0123456789.");

// Left loose on purpose: `auth.test` is the real gate, and a length rule that
// guessed wrong about a future token format would reject a working token.
const botToken = z.string().trim().min(10, "That token looks too short to be a bot token.");

const connectSchema = z.object({
  bot_token: botToken,
  channel_id: channelId,
});

/** Connect: verify the token, then store it and switch the digest on. */
export async function POST(req: Request) {
  const admin = await requireAdmin();

  const parsed = connectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);

  const check = await verifySlackToken(parsed.data.bot_token);
  if (!check.ok) return NextResponse.json({ error: check.message }, { status: 400 });

  const { error } = await saveSlackSettings(
    {
      connected: true,
      bot_token: parsed.data.bot_token,
      channel_id: parsed.data.channel_id,
    },
    admin.id
  );
  if (error) return NextResponse.json({ error: saveFailed(error) }, { status: 500 });

  return NextResponse.json({ ok: true, team: check.team, bot: check.bot });
}

const updateSchema = z
  .object({
    channel_id: channelId.optional(),
    post_hour: z.number().int().min(0).max(23).optional(),
    weekdays_only: z.boolean().optional(),
    silent_when_empty: z.boolean().optional(),
    share_half_days: z.boolean().optional(),
    // Rotating a token shouldn't require disconnecting first, so PATCH takes
    // one too — verified exactly as POST does before it's written.
    bot_token: botToken.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

/** Edit the settings shown on the card. */
export async function PATCH(req: Request) {
  const admin = await requireAdmin();

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);

  const patch: SlackSettingsPatch = { ...parsed.data };

  if (parsed.data.bot_token) {
    const check = await verifySlackToken(parsed.data.bot_token);
    if (!check.ok) return NextResponse.json({ error: check.message }, { status: 400 });
  }

  const { error } = await saveSlackSettings(patch, admin.id);
  if (error) return NextResponse.json({ error: saveFailed(error) }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/**
 * Disconnect: forget the token and stop posting.
 *
 * The row stays behind holding `connected: false`. That's the point — a
 * deployment with SLACK_BOT_TOKEN still set in its environment would otherwise
 * fall back to it and start posting again on the next cron run. The channel ID
 * is kept because it isn't a secret and reconnecting shouldn't mean hunting
 * for it a second time.
 */
export async function DELETE() {
  const admin = await requireAdmin();

  const { error } = await saveSlackSettings({ connected: false, bot_token: null }, admin.id);
  if (error) return NextResponse.json({ error: saveFailed(error) }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/** Surface the field message zod produced, rather than a flat "Invalid input". */
function badRequest(error: z.ZodError): NextResponse {
  const message = error.issues[0]?.message ?? "Invalid input";
  return NextResponse.json({ error: message }, { status: 400 });
}

function saveFailed(error: string): string {
  // The most likely cause by far is migration 009 not having been run yet.
  return `Couldn't save the settings (${error}). If this is a fresh deploy, run supabase/migrations/009_integration_settings.sql.`;
}
