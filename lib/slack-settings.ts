import { createAdminClient } from "@/lib/supabase/admin";
import { isBlackbird } from "@/lib/org";

/**
 * Where the Slack integration's configuration actually lives.
 *
 * The `integration_settings` row is authoritative once it exists; the
 * environment is the fallback for a deployment that has never saved one.
 * That ordering is what makes Disconnect mean something: an install with
 * SLACK_BOT_TOKEN still set in Vercel would otherwise reconnect itself on
 * the next request.
 *
 * Server-only. Reads `process.env` and uses the service-role client, so this
 * must never be imported into a client component.
 */

export const SLACK_INTEGRATION_ID = "slack";

const DEFAULT_POST_HOUR = 6;

export type SlackSettings = {
  /** Whether the digest should post at all. */
  connected: boolean;
  channel: string | null;
  postHour: number;
  weekdaysOnly: boolean;
  silentWhenEmpty: boolean;
  shareHalfDays: boolean;
  /** New leave requests go to each admin as a Slack DM with Approve / Reject. */
  approvalsEnabled: boolean;
  /** A signing secret is on file (row or environment). Never the secret itself. */
  hasSigningSecret: boolean;
  /** Migration 017 hasn't been run, so approvals can't be switched on yet. */
  approvalsMigrationMissing: boolean;
  /** True once a row exists — the app, not the environment, is in charge. */
  managedInApp: boolean;
  /** A token is on file. Never the token itself. */
  hasToken: boolean;
  /** The row supplies the token, so the environment's copy is now ignored. */
  tokenFromRow: boolean;
  /** The environment still carries Slack variables. Worth saying out loud
   *  once the row takes over, because they no longer do anything. */
  envVarsPresent: boolean;
};

type Row = {
  connected: boolean;
  bot_token: string | null;
  channel_id: string | null;
  post_hour: number;
  weekdays_only: boolean;
  silent_when_empty: boolean;
  share_half_days: boolean;
  approvals_enabled: boolean;
  signing_secret: string | null;
};

const ROW_COLUMNS =
  "connected, bot_token, channel_id, post_hour, weekdays_only, silent_when_empty, share_half_days";
const APPROVAL_COLUMNS = "approvals_enabled, signing_secret";

/** Postgres "undefined_column" — here, migration 017 not run yet. */
const UNDEFINED_COLUMN = "42703";

async function loadRow(orgId: string): Promise<{ row: Row | null; approvalsMigrationMissing: boolean }> {
  const supabase = createAdminClient();
  const read = (columns: string) =>
    supabase
      .from("integration_settings")
      .select(columns)
      .eq("organization_id", orgId)
      .eq("id", SLACK_INTEGRATION_ID)
      .maybeSingle();

  let approvalsMigrationMissing = false;
  let { data, error } = await read(`${ROW_COLUMNS}, ${APPROVAL_COLUMNS}`);

  // A deployment that shipped before migration 017 ran must keep its digest
  // posting. Read the columns it does have, and report approvals as
  // unavailable rather than letting one missing column blank the whole row.
  if (error?.code === UNDEFINED_COLUMN) {
    approvalsMigrationMissing = true;
    ({ data, error } = await read(ROW_COLUMNS));
  }

  if (error) {
    // Most likely cause: migration 009 hasn't been run yet. That should degrade
    // to the old environment-driven behaviour rather than take the admin page
    // — and the cron — down with it.
    console.error("[slack] could not read integration_settings:", error.message);
    return { row: null, approvalsMigrationMissing };
  }

  const row = data as unknown as Partial<Row> | null;
  return {
    row: row
      ? ({ approvals_enabled: false, signing_secret: null, ...row } as Row)
      : null,
    approvalsMigrationMissing,
  };
}

/**
 * Hour of day (0-23, Kosovo time) the digest posts, from the environment.
 *
 * Only used before a row exists. A missing or nonsense value falls back to the
 * default: `Number("nine")` is NaN, and an unguarded NaN target would make the
 * cron's "too early" gate always false and post at whatever hour it fired.
 */
function envPostHour(): number {
  const raw = Number(process.env.SLACK_DAILY_POST_HOUR);
  return Number.isInteger(raw) && raw >= 0 && raw <= 23 ? raw : DEFAULT_POST_HOUR;
}

type Resolved = { settings: SlackSettings; token: string | null; signingSecret: string | null };

/** One read, then everything else is derived from it. */
async function resolve(orgId: string): Promise<Resolved> {
  const { row, approvalsMigrationMissing } = await loadRow(orgId);
  // The environment variables predate companies and belong to Blackbird's
  // workspace. Anyone else would post their team's absences into it.
  const envToken = (isBlackbird(orgId) && process.env.SLACK_BOT_TOKEN) || null;
  const envChannel = (isBlackbird(orgId) && process.env.SLACK_CHANNEL_ID) || null;

  const envSecret = (isBlackbird(orgId) && process.env.SLACK_SIGNING_SECRET) || null;

  const token = row?.bot_token ?? envToken;
  const channel = row?.channel_id ?? envChannel;
  const signingSecret = row?.signing_secret ?? envSecret;

  return {
    token,
    signingSecret,
    settings: {
      // Credentials are necessary but not sufficient — a saved row that says
      // disconnected wins over a token sitting in the environment.
      connected: !!token && !!channel && (row ? row.connected : true),
      channel,
      postHour: row ? row.post_hour : envPostHour(),
      weekdaysOnly: row ? row.weekdays_only : true,
      silentWhenEmpty: row ? row.silent_when_empty : true,
      shareHalfDays: row ? row.share_half_days : true,
      // Never on by default: it only works once the Slack app has
      // interactivity pointed at this deployment, which an admin has to do.
      approvalsEnabled: !!token && !!signingSecret && !!row?.approvals_enabled,
      hasSigningSecret: !!signingSecret,
      approvalsMigrationMissing,
      managedInApp: !!row,
      hasToken: !!token,
      tokenFromRow: !!row?.bot_token,
      envVarsPresent: !!envToken || !!envChannel,
    },
  };
}

export async function loadSlackSettings(orgId: string): Promise<SlackSettings> {
  return (await resolve(orgId)).settings;
}

/**
 * The token and channel to post with, or null if the integration shouldn't
 * post at all. The token never leaves the server.
 */
export async function loadSlackCredentials(
  orgId: string
): Promise<{ token: string; channel: string } | null> {
  const { settings, token } = await resolve(orgId);
  if (!settings.connected || !token || !settings.channel) return null;
  return { token, channel: settings.channel };
}

/**
 * What approvals in Slack need: a token to send DMs with and the signing
 * secret to check button presses against. Null when approvals are off.
 *
 * Independent of `connected`, which governs the daily digest only.
 */
export async function loadSlackApprovalConfig(
  orgId: string
): Promise<{ token: string; signingSecret: string } | null> {
  const { settings, token, signingSecret } = await resolve(orgId);
  if (!settings.approvalsEnabled || !token || !signingSecret) return null;
  return { token, signingSecret };
}

/**
 * The signing secret on its own, for verifying a button press. Deliberately
 * returned even when approvals have since been switched off, so a press on an
 * old message can still be verified and then answered with "switched off"
 * instead of being dropped without a word.
 */
export async function loadSlackSigningSecret(orgId: string): Promise<string | null> {
  return (await resolve(orgId)).signingSecret;
}

export type SlackSettingsPatch = {
  connected?: boolean;
  /** `null` clears the stored token and falls back to the environment's. */
  bot_token?: string | null;
  channel_id?: string | null;
  post_hour?: number;
  weekdays_only?: boolean;
  silent_when_empty?: boolean;
  share_half_days?: boolean;
  approvals_enabled?: boolean;
  signing_secret?: string | null;
};

/**
 * Write the patch over whatever is in effect right now.
 *
 * The merge is against the *effective* settings rather than the column
 * defaults, so the first save on an environment-configured install carries the
 * environment's post hour into the row instead of silently resetting it to 6.
 */
export async function saveSlackSettings(
  patch: SlackSettingsPatch,
  admin: { id: string; organization_id: string }
): Promise<{ error: string | null }> {
  const { settings } = await resolve(admin.organization_id);

  const row: Record<string, unknown> = {
    organization_id: admin.organization_id,
    id: SLACK_INTEGRATION_ID,
    connected: patch.connected ?? settings.connected,
    channel_id: patch.channel_id ?? settings.channel,
    post_hour: patch.post_hour ?? settings.postHour,
    weekdays_only: patch.weekdays_only ?? settings.weekdaysOnly,
    silent_when_empty: patch.silent_when_empty ?? settings.silentWhenEmpty,
    share_half_days: patch.share_half_days ?? settings.shareHalfDays,
    updated_at: new Date().toISOString(),
    updated_by: admin.id,
  };

  // Only touched when the caller actually supplies one, so editing the channel
  // can't wipe the token already on file. An explicit null is a real value here
  // — that's how Disconnect clears it.
  if (patch.bot_token !== undefined) row.bot_token = patch.bot_token;
  // The approval columns arrive with migration 017. Written only when the
  // caller sets them, so the digest settings keep saving on a database that
  // hasn't had it yet.
  if (patch.approvals_enabled !== undefined) row.approvals_enabled = patch.approvals_enabled;
  if (patch.signing_secret !== undefined) row.signing_secret = patch.signing_secret;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("integration_settings")
    .upsert(row, { onConflict: "organization_id,id" });

  if (error) console.error("[slack] could not save integration_settings:", error.message);
  return { error: error?.message ?? null };
}
