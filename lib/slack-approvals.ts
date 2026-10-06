import { createHmac, timingSafeEqual } from "node:crypto";
import { format, parseISO } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { callSlack, esc, type SlackBlock } from "@/lib/slack";
import { loadSlackApprovalConfig } from "@/lib/slack-settings";
import { leaveTypeName } from "@/lib/leave-policies";

/**
 * Approving and rejecting leave from a Slack DM.
 *
 * A new request goes to every admin as a direct message from the app, with
 * Approve and Reject buttons — the Slack twin of the "new request" email.
 * Pressing one lands in app/api/slack/interactions, which decides the request
 * through the same `decideLeaveRequest` the Requests page uses.
 *
 * DMs rather than the digest channel on purpose: these messages name the leave
 * type, and the digest channel is company-wide. Sick leave stays between the
 * employee and the people who approve it, exactly as it does by email.
 *
 * Server-only. Everything here uses the service-role client.
 */

export const APPROVE_ACTION = "leave_approve";
export const REJECT_ACTION = "leave_reject";
export const OPEN_ACTION = "leave_open";
export const REJECT_MODAL = "leave_reject_modal";
export const NOTE_BLOCK = "note";
export const NOTE_INPUT = "note_input";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Slack drops requests older than this itself; so do we, against replays. */
const MAX_SIGNATURE_AGE_SECONDS = 60 * 5;

type Half = "full" | "am" | "pm";

export type ApprovalView = {
  id: string;
  organizationId: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  typeName: string;
  startDate: string;
  endDate: string;
  halfStart: Half;
  halfEnd: Half;
  days: number;
  reason: string | null;
  employeeName: string;
  deciderName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
};

type ViewRow = {
  id: string;
  organization_id: string;
  status: ApprovalView["status"];
  type: string;
  start_date: string;
  end_date: string;
  half_start: Half;
  half_end: Half;
  days_count: number | string;
  reason: string | null;
  decided_at: string | null;
  decision_note: string | null;
  employee: { full_name: string } | null;
  decider: { full_name: string } | null;
};

export async function loadApprovalView(id: string): Promise<ApprovalView | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("leave_requests")
    .select(
      "id, organization_id, status, type, start_date, end_date, half_start, half_end, days_count, reason, decided_at, decision_note, employee:user_id(full_name), decider:decided_by(full_name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[slack-approvals] could not load request:", error.message);
    return null;
  }

  const row = data as unknown as ViewRow;
  return {
    id: row.id,
    organizationId: row.organization_id,
    status: row.status,
    typeName: await leaveTypeName(db, row.organization_id, row.type),
    startDate: row.start_date,
    endDate: row.end_date,
    halfStart: row.half_start,
    halfEnd: row.half_end,
    days: Number(row.days_count),
    reason: row.reason,
    employeeName: row.employee?.full_name ?? "Someone",
    deciderName: row.decider?.full_name ?? null,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
  };
}

/**
 * DM every admin in the company about a new pending request.
 *
 * Admins are matched to Slack accounts by email address, which is why the
 * app needs users:read.email. An admin whose Slack account uses a different
 * address is skipped — they still get the email, which is unchanged.
 *
 * Never throws: the request is already saved and the email already sent.
 */
export async function notifyAdminsInSlack(requestId: string): Promise<void> {
  try {
    const view = await loadApprovalView(requestId);
    if (!view || view.status !== "pending") return;

    const config = await loadSlackApprovalConfig(view.organizationId);
    if (!config) return;

    const db = createAdminClient();
    const { data: admins } = await db
      .from("profiles")
      .select("id, email")
      .eq("organization_id", view.organizationId)
      .eq("role", "admin");

    const message = buildApprovalMessage(view);

    await Promise.all(
      (admins ?? []).map(async (admin: { id: string; email: string }) => {
        try {
          const found = await callSlack<{ user: { id: string } }>(
            config.token,
            "users.lookupByEmail",
            { email: admin.email },
            { form: true }
          );
          const slackUserId = found.user.id;

          // Posting to a user ID delivers to the app's DM with that person.
          const posted = await callSlack<{ channel: string; ts: string }>(
            config.token,
            "chat.postMessage",
            { channel: slackUserId, ...message, unfurl_links: false, unfurl_media: false }
          );

          const { error } = await db.from("slack_approval_messages").upsert(
            {
              leave_request_id: view.id,
              admin_id: admin.id,
              organization_id: view.organizationId,
              slack_user_id: slackUserId,
              channel: posted.channel,
              ts: posted.ts,
            },
            { onConflict: "leave_request_id,admin_id" }
          );
          if (error) console.error("[slack-approvals] could not record DM:", error.message);
        } catch (e) {
          const code = (e as { slackCode?: string }).slackCode;
          // Expected for an admin with no Slack account on that address.
          if (code === "users_not_found") return;
          console.warn(`[slack-approvals] could not DM admin ${admin.id}:`, e instanceof Error ? e.message : e);
        }
      })
    );
  } catch (e) {
    console.warn("[slack-approvals] notify failed:", e);
  }
}

/**
 * Rewrite every admin's copy of a request to match where it stands now.
 *
 * Called after anything that changes a request: a decision from either
 * Slack or the website, a cancellation, an edit. Once it is decided the
 * buttons go and the message says who decided it, so nobody is left pressing
 * a button that can no longer work.
 *
 * Never throws.
 */
export async function refreshSlackApprovalMessages(
  requestId: string,
  opts: { sendIfMissing?: boolean } = {}
): Promise<void> {
  try {
    const db = createAdminClient();
    const { data: sent, error } = await db
      .from("slack_approval_messages")
      .select("channel, ts")
      .eq("leave_request_id", requestId);

    // Migration 017 not run.
    if (error) return;

    // Nothing was ever sent — e.g. approved leave that was edited, and so is
    // waiting on a decision again. With `sendIfMissing` it goes out now;
    // notifyAdminsInSlack itself skips anything not pending.
    if (!sent?.length) {
      if (opts.sendIfMissing) await notifyAdminsInSlack(requestId);
      return;
    }

    const view = await loadApprovalView(requestId);
    if (!view) return;

    const config = await loadSlackApprovalConfig(view.organizationId);
    if (!config) return;

    const message = buildApprovalMessage(view);
    await Promise.all(
      sent.map(({ channel, ts }: { channel: string; ts: string }) =>
        callSlack(config.token, "chat.update", { channel, ts, ...message }).catch((e) =>
          console.warn("[slack-approvals] could not update DM:", e instanceof Error ? e.message : e)
        )
      )
    );
  } catch (e) {
    console.warn("[slack-approvals] refresh failed:", e);
  }
}

/**
 * The admin a Slack user is acting as, for one request.
 *
 * Tied to the DM the app sent rather than to whatever the Slack profile says
 * today: the button press has to come from the Slack account this request was
 * delivered to, and that person has to still be an admin of the same company.
 */
export async function findSlackApprover(
  requestId: string,
  slackUserId: string
): Promise<{ id: string; organization_id: string; full_name: string } | null> {
  const db = createAdminClient();
  const { data: sent } = await db
    .from("slack_approval_messages")
    .select("admin_id, organization_id")
    .eq("leave_request_id", requestId)
    .eq("slack_user_id", slackUserId)
    .limit(1)
    .maybeSingle();
  if (!sent) return null;

  const { data: admin } = await db
    .from("profiles")
    .select("id, organization_id, full_name, role")
    .eq("id", sent.admin_id)
    .eq("organization_id", sent.organization_id)
    .maybeSingle();
  if (!admin || admin.role !== "admin") return null;

  return { id: admin.id, organization_id: admin.organization_id, full_name: admin.full_name };
}

/**
 * Check a request really came from Slack.
 *
 * Slack signs `v0:{timestamp}:{raw body}` with the app's signing secret. The
 * body has to be the exact bytes received — which is why the route reads it
 * as text before parsing anything.
 */
export function verifySlackSignature(opts: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  nowSeconds?: number;
}): boolean {
  const { rawBody, timestamp, signature, secret } = opts;
  if (!timestamp || !signature) return false;

  const ts = Number(timestamp);
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SIGNATURE_AGE_SECONDS) return false;

  const expected =
    "v0=" + createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The DM, in whatever state the request is in. */
export function buildApprovalMessage(view: ApprovalView): { text: string; blocks: SlackBlock[] } {
  const name = esc(view.employeeName);
  const type = esc(view.typeName);
  const when = describeDates(view);
  const dayLabel = `${formatDays(view.days)} ${view.days === 1 ? "day" : "days"}`;

  const blocks: SlackBlock[] = [
    section(`*${name}* has requested *${type}*`),
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*When*\n${when}` },
        { type: "mrkdwn", text: `*Length*\n${dayLabel}` },
      ],
    },
  ];

  if (view.reason?.trim()) blocks.push(section(`*Reason*\n${quote(view.reason)}`));

  if (view.status === "pending") {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: APPROVE_ACTION,
          style: "primary",
          text: { type: "plain_text", text: "Approve" },
          value: view.id,
        },
        {
          type: "button",
          action_id: REJECT_ACTION,
          style: "danger",
          text: { type: "plain_text", text: "Reject" },
          value: view.id,
        },
        {
          type: "button",
          action_id: OPEN_ACTION,
          text: { type: "plain_text", text: "Open in Blackbird Leave" },
          url: `${SITE}/admin/requests`,
        },
      ],
    });
  } else {
    blocks.push(outcome(view));
  }

  // `text` is the notification preview. Escaped for the same reason the
  // digest escapes it: a `<!channel>` in a profile name would ping people.
  const headline =
    view.status === "pending"
      ? `${name} requested ${type} (${when}) — approve or reject`
      : `${name}'s ${type} request (${when}) — ${statusWord(view.status)}`;

  return { text: headline, blocks };
}

/** The modal Reject opens: one optional note, the same as on the website. */
export function buildRejectModal(view: ApprovalView): Record<string, unknown> {
  return {
    type: "modal",
    callback_id: REJECT_MODAL,
    private_metadata: JSON.stringify({ id: view.id }),
    title: { type: "plain_text", text: "Reject request" },
    submit: { type: "plain_text", text: "Reject request" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      section(`*${esc(view.employeeName)}* · ${esc(view.typeName)} · ${describeDates(view)}`),
      {
        type: "input",
        block_id: NOTE_BLOCK,
        optional: true,
        label: { type: "plain_text", text: "Note to the employee" },
        hint: { type: "plain_text", text: "Included in the email telling them it was rejected." },
        element: {
          type: "plain_text_input",
          action_id: NOTE_INPUT,
          multiline: true,
          max_length: 1000,
        },
      },
    ],
  };
}

function outcome(view: ApprovalView): SlackBlock {
  const by = view.deciderName ? ` by ${esc(view.deciderName)}` : "";
  const at = view.decidedAt ? ` · ${slackDate(view.decidedAt)}` : "";
  let line: string;

  switch (view.status) {
    case "approved":
      line = `✅ *Approved*${by}${at}`;
      break;
    case "rejected":
      line = `❌ *Rejected*${by}${at}`;
      break;
    default:
      line = "🚫 *Cancelled* — nothing to decide any more";
  }

  const note = view.status !== "cancelled" && view.decisionNote?.trim() ? `\n${quote(view.decisionNote)}` : "";
  return { type: "context", elements: [{ type: "mrkdwn", text: line + note }] };
}

function statusWord(status: ApprovalView["status"]): string {
  return status === "approved" ? "approved" : status === "rejected" ? "rejected" : "cancelled";
}

function describeDates(view: ApprovalView): string {
  const start = prettyDate(view.startDate);
  if (view.startDate === view.endDate) return `${start}${halfLabel(view.halfStart)}`;
  return `${start}${halfLabel(view.halfStart)} – ${prettyDate(view.endDate)}${halfLabel(view.halfEnd)}`;
}

function halfLabel(half: Half): string {
  if (half === "am") return " (morning only)";
  if (half === "pm") return " (afternoon only)";
  return "";
}

function prettyDate(iso: string): string {
  try {
    return format(parseISO(iso), "EEE d MMM yyyy");
  } catch {
    return iso;
  }
}

function formatDays(days: number): string {
  return Number.isInteger(days) ? String(days) : days.toFixed(1);
}

/** Rendered by Slack in each reader's own timezone, with a plain fallback. */
function slackDate(iso: string): string {
  const unix = Math.floor(new Date(iso).getTime() / 1000);
  if (!Number.isFinite(unix)) return "";
  return `<!date^${unix}^{date_short_pretty} at {time}|${iso.slice(0, 10)}>`;
}

function quote(text: string): string {
  return esc(text.trim())
    .split("\n")
    .map((line) => `>${line}`)
    .join("\n");
}

function section(markdown: string): SlackBlock {
  return { type: "section", text: { type: "mrkdwn", text: markdown } };
}
