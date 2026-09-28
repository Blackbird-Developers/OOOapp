import { APP_TIME_ZONE } from "@/lib/days";
import { loadSlackSettings, type SlackSettings } from "@/lib/slack-settings";
import { servablePostHours } from "@/lib/slack-schedule";
import { loadCalendarSettings, organizerIdentity } from "@/lib/calendar-settings";
import { loadAutoReplySettings } from "@/lib/auto-reply-settings";
import { autoReplyStats } from "@/lib/auto-reply";
import { googleCredentials } from "@/lib/google-auth";

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

export type IntegrationId = "slack" | "calendar" | "gmail";

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
  /** One line above the steps, in the service's own terms. */
  setupIntro: string;
  /** The shortest true path to connecting it. Only shown when it isn't. */
  setupSteps: string[];
  /** Where the full instructions live. */
  docs: string;
  /** State for the service's own editor, when it has one. */
  slack?: SlackPanel;
  calendar?: CalendarPanel;
  autoReply?: AutoReplyPanel;
};

/**
 * Seed state for the in-app auto-reply editor.
 *
 * Carries no credential and never could: the service account private key lives
 * in the deployment environment, and the only thing the browser is told is
 * whether one is present at all.
 */
export type AutoReplyPanel = {
  restrictToDomain: boolean;
  fallbackEmail: string;
  extraNote: string;
  /** A settings row exists, so this has been configured at least once. */
  managedInApp: boolean;
  /** GOOGLE_SA_* are set on this deployment. Never the key itself. */
  credentialsPresent: boolean;
  /** The Workspace domain the app will impersonate within. */
  domain: string | null;
  /** Responders the app has up right now. */
  active: number;
  /** Mailboxes whose last write failed, and one example of why. */
  failing: number;
  sampleError: string | null;
  /** People who switched it off for themselves. */
  optedOut: number;
  /**
   * Hierarchy groups on file. Zero is worth saying out loud: the replies still
   * go out, but none of them can name a colleague, which is the half of the
   * feature people actually asked for.
   */
  groups: number;
  /** Colleagues on an address outside the Workspace, who cannot be covered. */
  outsideDomain: number;
  /** Migration 014 has not been run yet. */
  migrationMissing: boolean;
};

/**
 * Seed state for the in-app calendar editor.
 *
 * No credential of any kind appears here, because the integration has none to
 * hold — iCalendar needs no token, which is exactly why it reaches Google,
 * Apple and Microsoft without three separate OAuth apps.
 */
export type CalendarPanel = {
  sendInvites: boolean;
  personalFeeds: boolean;
  /** A settings row exists, so this has been configured at least once. */
  managedInApp: boolean;
  /**
   * Resend is configured. Invitations travel by email, so without it the
   * invite half of the integration silently does nothing — worth saying on
   * the card rather than leaving an admin to wonder why nothing arrives.
   */
  emailConfigured: boolean;
  /** The ORGANIZER address recipients will see. */
  organizerEmail: string;
  /**
   * `NEXT_PUBLIC_SITE_URL` is missing or still points at localhost.
   *
   * Worse here than anywhere else it is used. Elsewhere a wrong site URL
   * produces a dead link in an email somebody can ignore; here it is baked
   * into the subscription address people paste into their calendar and keep,
   * and into the UID of every event ever sent. Both fail silently — the feed
   * simply never updates — so the only place it can realistically be caught
   * is on this card.
   */
  siteUrlUnset: boolean;
};

export async function listIntegrations(orgId: string): Promise<Integration[]> {
  return [
    await slackIntegration(orgId),
    await calendarIntegration(orgId),
    await autoReplyIntegration(orgId),
  ];
}

async function slackIntegration(orgId: string): Promise<Integration> {
  const settings = await loadSlackSettings(orgId);

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
    setupIntro: "Do the Slack-side setup once, then connect it here.",
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
 * Calendar: approved leave becomes a day off in the employee's own calendar.
 *
 * Reaches Google Calendar, Apple Calendar, Outlook and Teams through one
 * mechanism — the iCalendar invitation format every mail client already
 * understands — rather than a separate API integration per vendor. That is not
 * a shortcut: Apple publishes no server-side write API for iCloud Calendar at
 * all, so a push-based design could never have covered iPhone and Mac users,
 * and Teams has no calendar of its own to target because it renders the
 * Microsoft 365 one.
 */
async function calendarIntegration(orgId: string): Promise<Integration> {
  const settings = await loadCalendarSettings(orgId);
  const organizer = organizerIdentity();
  const emailConfigured = !!process.env.RESEND_API_KEY;

  // Treated as unset when it is still the localhost default, because that is
  // what a Vercel deploy that never had the variable filled in looks like.
  // Not while developing, though — there localhost is the correct answer, and
  // a warning that is wrong every time you see it teaches you to ignore it.
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const siteUrlUnset =
    process.env.NODE_ENV !== "development" &&
    (!site || /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(site));

  return {
    id: "calendar",
    name: "Calendar",
    category: "Scheduling",
    summary:
      "Puts approved leave in each person's own calendar, so their days off block their availability.",
    connected: settings.connected,
    details: [
      { label: "Delivery", value: describeDelivery(settings) },
      { label: "Works with", value: "Google, Apple, Outlook and Teams" },
      { label: "Invitations from", value: organizer.email },
      // The same guarantee the Slack digest makes, for the same reason: a work
      // calendar is rarely as private as it looks.
      { label: "Shows as", value: "Out of office. Never the leave type." },
    ],
    setupIntro: "Nothing to set up with Google, Apple or Microsoft — switch it on and it works.",
    setupSteps: [
      "Approved leave is emailed to the employee as a calendar invitation, which their calendar app files automatically.",
      "Each person can also subscribe to a private feed from their account page, so their calendar stays in step on its own.",
      "Editing or cancelling approved leave withdraws the entry again.",
    ],
    docs: "README section 10",
    calendar: {
      sendInvites: settings.sendInvites,
      personalFeeds: settings.personalFeeds,
      managedInApp: settings.managedInApp,
      emailConfigured,
      organizerEmail: organizer.email,
      siteUrlUnset,
    },
  };
}


/**
 * Gmail auto-reply: the mailbox answers for someone while they are away.
 *
 * The one integration here that holds a real credential with real reach — a
 * service account the Workspace has authorised to act as any employee. Worth
 * being precise about the limits on the card, because "acts as any employee"
 * is alarming until you know the scope covers mailbox settings and cannot read
 * a single message.
 */
async function autoReplyIntegration(orgId: string): Promise<Integration> {
  const settings = await loadAutoReplySettings(orgId);
  const credentials = googleCredentials(orgId);
  const stats = settings.connected
    ? await autoReplyStats(orgId)
    : {
        active: 0,
        failing: 0,
        sampleError: null,
        optedOut: 0,
        groups: 0,
        outsideDomain: 0,
        migrationMissing: false,
      };

  return {
    id: "gmail",
    name: "Gmail auto-reply",
    category: "Mailbox",
    summary:
      "Answers email while someone is on leave, and points the sender at a colleague who is in.",
    connected: settings.connected,
    details: [
      { label: "Replying now", value: describeActive(stats.active) },
      { label: "Replies to", value: settings.restrictToDomain ? "Colleagues only" : "Everyone, including clients" },
      { label: "Names", value: "A free colleague from Hierarchy. Never the leave type." },
      { label: "Workspace", value: credentials?.domain ?? "Any domain" },
    ],
    setupIntro: "Three steps in the Google consoles, then connect it here.",
    setupSteps: [
      "In Google Cloud, create a service account and enable the Gmail API on the project.",
      "In the Google Admin console, authorise that client ID for the scope https://www.googleapis.com/auth/gmail.settings.basic under domain-wide delegation.",
      "Put the key in GOOGLE_SA_CLIENT_EMAIL and GOOGLE_SA_PRIVATE_KEY, then press Connect.",
    ],
    docs: "README section 12",
    autoReply: {
      restrictToDomain: settings.restrictToDomain,
      fallbackEmail: settings.fallbackEmail ?? "",
      extraNote: settings.extraNote ?? "",
      managedInApp: settings.managedInApp,
      credentialsPresent: !!credentials,
      domain: credentials?.domain ?? null,
      ...stats,
    },
  };
}

function describeActive(active: number): string {
  if (active === 0) return "Nobody";
  return active === 1 ? "1 person" : `${active} people`;
}

function describeDelivery(s: { sendInvites: boolean; personalFeeds: boolean }): string {
  const parts = [
    s.sendInvites ? "Invitation on approval" : null,
    s.personalFeeds ? "personal subscription feeds" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Nothing enabled";
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
