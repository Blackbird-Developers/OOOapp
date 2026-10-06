import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { unverifiedResponse } from "@/lib/verification";
import { callSlack, verifySlackToken } from "@/lib/slack";
import {
  loadSlackCredentials,
  loadSlackSettings,
  saveSlackSettings,
  type SlackSettingsPatch,
} from "@/lib/slack-settings";
import { servablePostHours } from "@/lib/slack-schedule";

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

// Slack's signing secrets are 32 hex characters today. Kept to "long and no
// spaces" for the same reason as the token: a wrong guess about the format
// would lock out a working secret. A wrong secret shows up as presses that
// are refused, which the setup steps explain.
const signingSecret = z
  .string()
  .trim()
  .regex(/^\S{16,}$/, "That doesn't look like a signing secret. Copy it from Basic Information → App Credentials.");

// An hour no scheduled cron run can reach is not a preference, it is an outage
// with a friendly label — the digest would simply stop. The dropdown already
// hides these; this is the same rule for anything talking to the API directly.
const SERVABLE_HOURS = servablePostHours();
const postHour = z.number().int().refine((h) => SERVABLE_HOURS.includes(h), {
  message: `This deployment's cron schedule never reaches that hour. Pick one of ${SERVABLE_HOURS.map(
    (h) => `${String(h).padStart(2, "0")}:00`
  ).join(", ")}, or widen the cron in vercel.json.`,
});

const connectSchema = z.object({
  bot_token: botToken,
  channel_id: channelId,
});

/** Connect: verify the token, then store it and switch the digest on. */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  const locked = await unverifiedResponse(admin.organization_id, "connecting Slack");
  if (locked) return locked;

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
    admin
  );
  if (error) return NextResponse.json({ error: saveFailed(error) }, { status: 500 });

  return NextResponse.json({ ok: true, team: check.team, bot: check.bot });
}

const updateSchema = z
  .object({
    channel_id: channelId.optional(),
    post_hour: postHour.optional(),
    weekdays_only: z.boolean().optional(),
    silent_when_empty: z.boolean().optional(),
    share_half_days: z.boolean().optional(),
    approvals_enabled: z.boolean().optional(),
    signing_secret: signingSecret.optional(),
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

  const touchesApprovals =
    parsed.data.approvals_enabled !== undefined || parsed.data.signing_secret !== undefined;

  if (touchesApprovals) {
    const settings = await loadSlackSettings(admin.organization_id);
    if (settings.approvalsMigrationMissing) {
      return NextResponse.json(
        { error: "Run supabase/migrations/017_slack_leave_approvals.sql first, then switch this on." },
        { status: 400 }
      );
    }

    if (parsed.data.approvals_enabled) {
      if (!parsed.data.signing_secret && !settings.hasSigningSecret) {
        return NextResponse.json(
          { error: "Paste the Slack app's signing secret to switch approvals on." },
          { status: 400 }
        );
      }

      // Prove the token can find people by email now, rather than discovering
      // the missing scope when the first request quietly never arrives.
      const token = parsed.data.bot_token;
      const problem = await checkApprovalScopes(admin.email, token, admin.organization_id);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }
  }

  const { error } = await saveSlackSettings(patch, admin);
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

  // Approvals send with the same token, so they stop too. Only written once
  // migration 017 exists, so Disconnect keeps working on a database without it.
  const { approvalsMigrationMissing } = await loadSlackSettings(admin.organization_id);
  const { error } = await saveSlackSettings(
    {
      connected: false,
      bot_token: null,
      ...(approvalsMigrationMissing ? {} : { approvals_enabled: false }),
    },
    admin
  );
  if (error) return NextResponse.json({ error: saveFailed(error) }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/** Surface the field message zod produced, rather than a flat "Invalid input". */
function badRequest(error: z.ZodError): NextResponse {
  const message = error.issues[0]?.message ?? "Invalid input";
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Look the admin switching approvals on up by their own email. That needs
 * users:read.email, the scope approvals add — so a missing scope is caught
 * here, and so is the admin's Slack account using a different address.
 */
async function checkApprovalScopes(
  email: string,
  newToken: string | undefined,
  orgId: string
): Promise<string | null> {
  const token = newToken ?? (await loadSlackCredentials(orgId))?.token ?? null;
  if (!token) return "Connect Slack first.";

  try {
    await callSlack(token, "users.lookupByEmail", { email }, { form: true });
    return null;
  } catch (e) {
    const code = (e as { slackCode?: string }).slackCode;
    if (code === "users_not_found") {
      return `Slack has no account for ${email}. Approvals are sent to admins by matching their Blackbird Leave email to their Slack email — use the same address in both.`;
    }
    if (code === "missing_scope") {
      return "The Slack app needs the users:read and users:read.email scopes to find admins. Add them under OAuth & Permissions, reinstall the app, then try again.";
    }
    return e instanceof Error ? e.message : "Couldn't check the Slack app's permissions.";
  }
}

function saveFailed(error: string): string {
  // The most likely cause by far is migration 009 not having been run yet.
  return `Couldn't save the settings (${error}). If this is a fresh deploy, run supabase/migrations/009_integration_settings.sql.`;
}
