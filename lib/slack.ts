import { format, parseISO } from "date-fns";
import type { DayAvailability, PersonOff } from "@/lib/whos-off";

const POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export function slackChannel(): string | null {
  return process.env.SLACK_CHANNEL_ID || null;
}

export function isSlackConfigured(): boolean {
  return !!process.env.SLACK_BOT_TOKEN && !!slackChannel();
}

const DEFAULT_POST_HOUR = 6;

/**
 * Hour of day (0-23, Kosovo time) the daily digest posts.
 *
 * Lives here rather than in the cron route because the Integrations page
 * shows this number to admins, and a page that disagreed with the job it
 * describes would be worse than no page. A missing or nonsense value falls
 * back to the default: `Number("nine")` is NaN, and an unguarded NaN target
 * would make the "too early" gate always false and post at whatever hour the
 * cron happened to fire.
 */
export function slackPostHour(): number {
  const raw = Number(process.env.SLACK_DAILY_POST_HOUR);
  return Number.isInteger(raw) && raw >= 0 && raw <= 23 ? raw : DEFAULT_POST_HOUR;
}

type SlackBlock = Record<string, unknown>;

/**
 * Post to the configured channel via chat.postMessage.
 *
 * Slack answers 200 with `{ ok: false, error }` for most failures rather than
 * using a status code, so the body is what we check — same shape of problem as
 * Resend in lib/email.ts.
 */
export async function postToSlack(opts: { text: string; blocks: SlackBlock[] }): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = slackChannel();

  if (!token || !channel) {
    console.warn("[slack] SLACK_BOT_TOKEN or SLACK_CHANNEL_ID not set; skipping post");
    throw new Error("Slack is not configured (SLACK_BOT_TOKEN / SLACK_CHANNEL_ID missing).");
  }

  const res = await fetch(POST_MESSAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel,
      text: opts.text, // fallback for notifications and screen readers
      blocks: opts.blocks,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

  if (!json?.ok) {
    const code = json?.error ?? `http_${res.status}`;
    console.error("[slack] post failed:", code);
    throw new Error(explainSlackError(code));
  }
}

/** Turn Slack's error codes into something an admin can act on. */
function explainSlackError(code: string): string {
  switch (code) {
    case "not_in_channel":
      return "The bot isn't a member of that channel. Invite it with /invite @Blackbird Leave in the channel.";
    case "channel_not_found":
      return "SLACK_CHANNEL_ID doesn't match a channel this bot can see. Check the ID and that the bot is installed.";
    case "invalid_auth":
    case "token_revoked":
    case "account_inactive":
      return "SLACK_BOT_TOKEN is invalid or was revoked. Reinstall the app and copy the new bot token.";
    case "missing_scope":
      return "The Slack app is missing the chat:write scope. Add it under OAuth & Permissions, then reinstall.";
    case "is_archived":
      return "That channel is archived. Unarchive it or point SLACK_CHANNEL_ID at a live channel.";
    case "ratelimited":
      return "Slack rate-limited the request. Try again in a minute.";
    default:
      return `Slack rejected the message (${code}).`;
  }
}

/**
 * The daily digest.
 *
 * Carries no leave type on purpose — this lands in a company-wide channel and
 * sick leave is health data. Everyone reads as simply "out".
 */
export function buildDailyDigest(day: DayAvailability): { text: string; blocks: SlackBlock[] } {
  const pretty = format(parseISO(day.dateISO), "EEEE, d MMMM");

  if (day.holiday) {
    const name = esc(day.holiday.name);
    return {
      text: `Public holiday — office closed (${name})`,
      blocks: [
        section(`*🎉 Public holiday — office closed*\n_${pretty} · ${name}_`),
        footer("Nobody's expected in today"),
      ],
    };
  }

  if (day.people.length === 0) {
    return {
      text: `Everyone's in today — ${pretty}`,
      blocks: [section(`*✅ Everyone's in today*\n_${pretty}_`), footer("No leave on the calendar")],
    };
  }

  const list = day.people.map((p) => `• ${esc(p.name)}${portionSuffix(p)}`).join("\n");
  const count = day.people.length;
  const countLabel = `${count} ${count === 1 ? "person" : "people"} out`;

  return {
    // Escaped here too, not just in the blocks: `text` is what Slack shows in
    // the notification, and it parses mentions — an unescaped `<!channel>` in
    // someone's profile name would ping the whole workspace from a push alert.
    text: `${countLabel} today — ${day.people.map((p) => esc(p.name)).join(", ")}`,
    blocks: [section(`*🌴 Out of office today*\n_${pretty}_`), section(list), footer(countLabel)],
  };
}

function portionSuffix(p: PersonOff): string {
  if (p.portion === "am") return "  ·  _morning only_";
  if (p.portion === "pm") return "  ·  _afternoon only_";
  return "";
}

function section(markdown: string): SlackBlock {
  return { type: "section", text: { type: "mrkdwn", text: markdown } };
}

function footer(label: string): SlackBlock {
  return {
    type: "context",
    elements: [{ type: "mrkdwn", text: `${esc(label)}  ·  <${SITE}/dashboard|Open Blackbird Leave>` }],
  };
}

/**
 * Slack mrkdwn only reserves these three. Names come from user-editable
 * profiles, so escape them before they hit a message body.
 */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
