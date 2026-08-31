import { APP_TIME_ZONE } from "@/lib/days";
import { isSlackConfigured, slackChannel, slackPostHour } from "@/lib/slack";

/**
 * What Blackbird Leave talks to, and whether it's talking.
 *
 * Everything here is derived from the same helpers the features themselves
 * use — the page never re-reads an env var on its own. Add a service by
 * writing one builder and listing it in `listIntegrations`; the admin page
 * renders whatever the registry returns.
 *
 * Server-only: the builders read `process.env`, so this must never be
 * imported into a client component.
 */

export type IntegrationId = "slack";

/** A single "Channel: C0123…" line under a connected integration. */
export type IntegrationDetail = { label: string; value: string };

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
};

export function listIntegrations(): Integration[] {
  return [slackIntegration()];
}

function slackIntegration(): Integration {
  const connected = isSlackConfigured();
  const hour = String(slackPostHour()).padStart(2, "0");

  return {
    id: "slack",
    name: "Slack",
    category: "Notifications",
    summary: "Posts a daily out-of-office digest so the team knows who's away before standup.",
    connected,
    details: [
      // The channel ID is not a credential — it's visible to everyone in the
      // workspace, and it's the one value an admin needs to check when the
      // digest lands in the wrong place. The bot token is never surfaced.
      { label: "Channel", value: slackChannel() ?? "—" },
      { label: "Posts at", value: `${hour}:00 Kosovo time (${APP_TIME_ZONE})` },
      { label: "Schedule", value: "Weekdays only · silent when nobody is off" },
      { label: "Shares", value: "Names and half-days. Never the leave type." },
    ],
    setupSteps: [
      "Create a Slack app with the chat:write scope and install it to your workspace.",
      "Invite the bot to the channel that should receive the digest.",
      "Set SLACK_BOT_TOKEN and SLACK_CHANNEL_ID in Vercel → Settings → Environment Variables, then redeploy.",
    ],
    docs: "README section 7",
  };
}
