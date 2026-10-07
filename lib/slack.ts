import { format, parseISO } from "date-fns";
import type { DayAvailability, PersonOff } from "@/lib/whos-off";
import { loadSlackCredentials } from "@/lib/slack-settings";

const POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage";
const AUTH_TEST_URL = "https://slack.com/api/auth.test";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export type SlackBlock = Record<string, unknown>;

/**
 * Call a Slack Web API method with a bot token.
 *
 * Returns the parsed body when Slack says `ok`, and throws an Error carrying
 * an admin-readable explanation otherwise. The raw error code rides along on
 * `slackCode` for callers that branch on it (e.g. `users_not_found`).
 */
export async function callSlack<T extends Record<string, unknown>>(
  token: string,
  method: string,
  body: Record<string, unknown>,
  opts: { form?: boolean } = {}
): Promise<T> {
  // Slack's read methods (users.lookupByEmail among them) don't accept JSON
  // bodies, only form encoding; the write methods take either.
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": opts.form
        ? "application/x-www-form-urlencoded"
        : "application/json; charset=utf-8",
    },
    body: opts.form
      ? new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)])).toString()
      : JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;

  if (!json?.ok) {
    const code = json?.error ?? `http_${res.status}`;
    const err = new Error(explainSlackError(code)) as Error & { slackCode?: string };
    err.slackCode = code;
    throw err;
  }
  return json;
}

/**
 * Post to the configured channel via chat.postMessage.
 *
 * Slack answers 200 with `{ ok: false, error }` for most failures rather than
 * using a status code, so the body is what we check — same shape of problem as
 * Resend in lib/email.ts.
 */
export async function postToSlack(
  orgId: string,
  opts: { text: string; blocks: SlackBlock[] }
): Promise<void> {
  const creds = await loadSlackCredentials(orgId);

  if (!creds) {
    console.warn("[slack] not connected; skipping post");
    throw new Error("Slack isn't connected. Connect it on the Integrations page.");
  }

  const res = await fetch(POST_MESSAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: creds.channel,
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

export type SlackTokenCheck =
  | { ok: true; team: string | null; bot: string | null }
  | { ok: false; message: string };

/**
 * Confirm a bot token before storing it, so Connect fails at the moment the
 * admin can still fix the paste rather than silently at 06:00 tomorrow.
 *
 * `auth.test` is deliberately the only call made here: it needs no scope
 * beyond what the token already carries, so verifying costs nothing and can't
 * fail for a reason the admin can't act on. Whether the bot can actually write
 * to the channel is proved separately by "Post to Slack now" — checking it
 * here would demand `channels:read`, a scope this app has never asked for.
 */
export async function verifySlackToken(token: string): Promise<SlackTokenCheck> {
  let json: { ok?: boolean; error?: string; team?: string; user?: string } | null = null;

  try {
    const res = await fetch(AUTH_TEST_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    json = await res.json().catch(() => null);
  } catch {
    return { ok: false, message: "Couldn't reach Slack to check the token. Try again." };
  }

  if (!json?.ok) return { ok: false, message: explainSlackError(json?.error ?? "invalid_auth") };
  return { ok: true, team: json.team ?? null, bot: json.user ?? null };
}

/** Turn Slack's error codes into something an admin can act on. */
function explainSlackError(code: string): string {
  switch (code) {
    case "not_in_channel":
      return "The bot isn't a member of that channel. Invite it with /invite @Blackbird Leave in the channel.";
    case "channel_not_found":
      return "That channel ID doesn't match a channel this bot can see. Check the ID and that the app is installed.";
    case "invalid_auth":
    case "not_authed":
    case "token_revoked":
    case "account_inactive":
      return "That bot token is invalid or was revoked. Reinstall the Slack app and copy the new bot token.";
    case "missing_scope":
      return "The Slack app is missing a scope. It needs chat:write, plus users:read and users:read.email for approvals. Add them under OAuth & Permissions, then reinstall.";
    case "users_not_found":
      return "No Slack account uses that email address.";
    case "expired_trigger_id":
      return "Slack took too long to open the form. Press the button again.";
    case "is_archived":
      return "That channel is archived. Unarchive it or point the integration at a live channel.";
    case "ratelimited":
      return "Slack rate-limited the request. Try again in a minute.";
    default:
      return `Slack rejected the request (${code}).`;
  }
}

/** What the digest is allowed to say about the people in it. */
export type DigestOptions = {
  /** Append "morning only" / "afternoon only". The leave type is never shared. */
  shareHalfDays?: boolean;
};

/**
 * The daily digest.
 *
 * Carries no leave type on purpose — this lands in a company-wide channel and
 * sick leave is health data. Everyone reads as simply "out". That is not a
 * setting: there is no admin toggle for it anywhere, by design.
 */
export function buildDailyDigest(
  day: DayAvailability,
  options: DigestOptions = {}
): { text: string; blocks: SlackBlock[] } {
  const { shareHalfDays = true } = options;
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

  // A public holiday for part of the team only (the Kosovo staff, say, while
  // Ireland works). Said once per calendar, with who it covers.
  const holidayBlocks = day.holidaysOff.map((h) =>
    section(`*🎉 Public holiday in ${esc(h.calendar)}* · _${esc(h.name)}_\n${h.people.map((n) => `• ${esc(n)}`).join("\n")}`)
  );
  const onHoliday = day.holidaysOff.reduce((n, h) => n + h.people.length, 0);

  if (day.people.length === 0 && onHoliday === 0) {
    return {
      text: `Everyone's in today — ${pretty}`,
      blocks: [section(`*✅ Everyone's in today*\n_${pretty}_`), footer("No leave on the calendar")],
    };
  }

  const count = day.people.length + onHoliday;
  const countLabel = `${count} ${count === 1 ? "person" : "people"} out`;
  const names = [...day.people.map((p) => p.name), ...day.holidaysOff.flatMap((h) => h.people)];
  const leaveBlocks =
    day.people.length === 0
      ? []
      : [
          section(
            day.people.map((p) => `• ${esc(p.name)}${shareHalfDays ? portionSuffix(p) : ""}`).join("\n")
          ),
        ];

  return {
    // Escaped here too, not just in the blocks: `text` is what Slack shows in
    // the notification, and it parses mentions — an unescaped `<!channel>` in
    // someone's profile name would ping the whole workspace from a push alert.
    text: `${countLabel} today — ${names.map(esc).join(", ")}`,
    blocks: [
      section(`*🌴 Out of office today*\n_${pretty}_`),
      ...leaveBlocks,
      ...holidayBlocks,
      footer(countLabel),
    ],
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
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
