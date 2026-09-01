import { createAdminClient } from "@/lib/supabase/admin";

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
};

const ROW_COLUMNS =
  "connected, bot_token, channel_id, post_hour, weekdays_only, silent_when_empty, share_half_days";

async function loadRow(): Promise<Row | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("integration_settings")
    .select(ROW_COLUMNS)
    .eq("id", SLACK_INTEGRATION_ID)
    .maybeSingle();

  if (error) {
    // Most likely cause: migration 009 hasn't been run yet. That should degrade
    // to the old environment-driven behaviour rather than take the admin page
    // — and the cron — down with it.
    console.error("[slack] could not read integration_settings:", error.message);
    return null;
  }

  return (data as Row | null) ?? null;
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

type Resolved = { settings: SlackSettings; token: string | null };

/** One read, then everything else is derived from it. */
async function resolve(): Promise<Resolved> {
  const row = await loadRow();
  const envToken = process.env.SLACK_BOT_TOKEN || null;
  const envChannel = process.env.SLACK_CHANNEL_ID || null;

  const token = row?.bot_token ?? envToken;
  const channel = row?.channel_id ?? envChannel;

  return {
    token,
    settings: {
      // Credentials are necessary but not sufficient — a saved row that says
      // disconnected wins over a token sitting in the environment.
      connected: !!token && !!channel && (row ? row.connected : true),
      channel,
      postHour: row ? row.post_hour : envPostHour(),
      weekdaysOnly: row ? row.weekdays_only : true,
      silentWhenEmpty: row ? row.silent_when_empty : true,
      shareHalfDays: row ? row.share_half_days : true,
      managedInApp: !!row,
      hasToken: !!token,
      tokenFromRow: !!row?.bot_token,
      envVarsPresent: !!envToken || !!envChannel,
    },
  };
}

export async function loadSlackSettings(): Promise<SlackSettings> {
  return (await resolve()).settings;
}

/**
 * The token and channel to post with, or null if the integration shouldn't
 * post at all. The token never leaves the server.
 */
export async function loadSlackCredentials(): Promise<{ token: string; channel: string } | null> {
  const { settings, token } = await resolve();
  if (!settings.connected || !token || !settings.channel) return null;
  return { token, channel: settings.channel };
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
  adminId: string
): Promise<{ error: string | null }> {
  const { settings } = await resolve();

  const row: Record<string, unknown> = {
    id: SLACK_INTEGRATION_ID,
    connected: patch.connected ?? settings.connected,
    channel_id: patch.channel_id ?? settings.channel,
    post_hour: patch.post_hour ?? settings.postHour,
    weekdays_only: patch.weekdays_only ?? settings.weekdaysOnly,
    silent_when_empty: patch.silent_when_empty ?? settings.silentWhenEmpty,
    share_half_days: patch.share_half_days ?? settings.shareHalfDays,
    updated_at: new Date().toISOString(),
    updated_by: adminId,
  };

  // Only touched when the caller actually supplies one, so editing the channel
  // can't wipe the token already on file. An explicit null is a real value here
  // — that's how Disconnect clears it.
  if (patch.bot_token !== undefined) row.bot_token = patch.bot_token;

  const supabase = createAdminClient();
  const { error } = await supabase.from("integration_settings").upsert(row, { onConflict: "id" });

  if (error) console.error("[slack] could not save integration_settings:", error.message);
  return { error: error?.message ?? null };
}
