import { APP_TIME_ZONE } from "@/lib/days";
import { loadSlackSettings, type SlackSettings } from "@/lib/slack-settings";
import { servablePostHours } from "@/lib/slack-schedule";

/**
 * What Blackbird Leave talks to, and whether it's talking.
 *
 * Everything here is derived from the same helpers the features themselves
 * use — the page never re-reads a setting on its own. Add a service by
 * writing one builder and listing it in `listIntegrations`; the admin page
 * renders whatever the registry returns.
 *
 * Server-only: the builders reach the database and `process.env`, so this must
 * never be imported into a client component.
 */

export type IntegrationId = "slack";

/** A single "Channel: C0123…" line under a connected integration. */
export type IntegrationDetail = { label: string; value: string };

/**
 * Seed state for the in-app Slack editor.
 *
 * Deliberately not the bot token — only whether one is on file. This object is
 * serialised into a client component, so anything added here is something the
 * browser gets to see.
 */
export type SlackPanel = {
  channel: string;
  postHour: number;
  /**
   * The post hours this deployment's cron schedule can actually deliver.
   * Offering more would let an admin pick an hour that never fires.
   */
  postHourChoices: number[];
  weekdaysOnly: boolean;
  silentWhenEmpty: boolean;
  shareHalfDays: boolean;
  hasToken: boolean;
  /** The stored row supplies the token, so the environment's copy is unused. */
  tokenFromRow: boolean;
  /** A settings row exists, so the environment no longer decides anything. */
  managedInApp: boolean;
  /** Slack environment variables are still set on this deployment. */
  envVarsPresent: boolean;
};

export type Integration = {
  id: IntegrationId;
  name: string;
  /** Grouping label shown next to the name, e.g. "Notifications". */
  category: string;
  /** One line, in the admin's terms: what the team gets out of it. */
  summary: string;
  connected: boolean;
  /** Settings worth confirming at a glance. Only shown when connected. */
  details: IntegrationDetail[];
  /** The shortest true path to connecting it. Only shown when it isn't. */
  setupSteps: string[];
  /** Where the full instructions live. */
  docs: string;
  /** State for the service's own editor, when it has one. */
  slack?: SlackPanel;
};

export async function listIntegrations(): Promise<Integration[]> {
  return [await slackIntegration()];
}

async function slackIntegration(): Promise<Integration> {
  const settings = await loadSlackSettings();

  return {
    id: "slack",
    name: "Slack",
    category: "Notifications",
    summary: "Posts a daily out-of-office digest so the team knows who's away before standup.",
    connected: settings.connected,
    details: [
      // The channel ID is not a credential — it's visible to everyone in the
      // workspace, and it's the one value an admin needs to check when the
      // digest lands in the wrong place. The bot token is never surfaced.
      { label: "Channel", value: settings.channel ?? "—" },
      { label: "Posts at", value: `${pad(settings.postHour)}:00 Kosovo time (${APP_TIME_ZONE})` },
      { label: "Schedule", value: describeSchedule(settings) },
      { label: "Shares", value: describeSharing(settings) },
    ],
    setupSteps: [
      "Create a Slack app with the chat:write scope and install it to your workspace.",
      "Invite the bot to the channel that should receive the digest.",
      "Paste the bot token and channel ID below, then press Connect.",
    ],
    docs: "README section 7",
    slack: {
      channel: settings.channel ?? "",
      postHour: settings.postHour,
      postHourChoices: postHourChoices(settings.postHour),
      weekdaysOnly: settings.weekdaysOnly,
      silentWhenEmpty: settings.silentWhenEmpty,
      shareHalfDays: settings.shareHalfDays,
      hasToken: settings.hasToken,
      tokenFromRow: settings.tokenFromRow,
      managedInApp: settings.managedInApp,
      envVarsPresent: settings.envVarsPresent,
    },
  };
}

/**
 * What the "Posts at" dropdown may offer.
 *
 * Whatever is already stored is always included, even when the cron schedule
 * can no longer serve it — narrowing vercel.json shouldn't silently rewrite a
 * saved setting the moment an admin opens the editor. It shows up as a choice
 * they can move away from, and the hint explains why it stopped firing.
 */
function postHourChoices(current: number): number[] {
  const servable = servablePostHours();
  return servable.includes(current) ? servable : [...servable, current].sort((a, b) => a - b);
}

function describeSchedule(s: SlackSettings): string {
  return [
    s.weekdaysOnly ? "Weekdays only" : "Every day",
    s.silentWhenEmpty ? "silent when nobody is off" : "posts even on quiet days",
  ].join(" · ");
}

function describeSharing(s: SlackSettings): string {
  // The second sentence is a guarantee, not a setting — see buildDailyDigest.
  return s.shareHalfDays
    ? "Names and half-days. Never the leave type."
    : "Names only. Never the leave type.";
}

function pad(hour: number): string {
  return String(hour).padStart(2, "0");
}
