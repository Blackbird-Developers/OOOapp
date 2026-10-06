import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callSlack } from "@/lib/slack";
import { loadSlackApprovalConfig, loadSlackSigningSecret } from "@/lib/slack-settings";
import { decideLeaveRequest } from "@/lib/leave-decision";
import {
  APPROVE_ACTION,
  NOTE_BLOCK,
  NOTE_INPUT,
  OPEN_ACTION,
  REJECT_ACTION,
  REJECT_MODAL,
  buildRejectModal,
  findSlackApprover,
  loadApprovalView,
  refreshSlackApprovalMessages,
  verifySlackSignature,
} from "@/lib/slack-approvals";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Slack's Interactivity Request URL: every Approve / Reject press lands here.
 *
 * Public in middleware, because Slack holds no session. The signature is the
 * credential instead — checked against the signing secret of the company the
 * request belongs to before anything is changed. Nothing is written until it
 * verifies; the only work done first is reading which company that is.
 *
 * Slack wants an answer within three seconds, so the decision itself — with
 * its email, calendar entry and auto-reply — runs in `after()`, once Slack
 * has had its 200. The DM is rewritten to show the outcome when it finishes.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const payload = parsePayload(rawBody);
  if (!payload) return new NextResponse("Bad request", { status: 400 });

  // The "Open in Blackbird Leave" link button still reports its press. Nothing
  // to do — Slack only needs the acknowledgement.
  const action = payload.actions?.[0];
  if (payload.type === "block_actions" && action?.action_id === OPEN_ACTION) {
    return new NextResponse(null, { status: 200 });
  }

  const requestId = requestIdFrom(payload);
  if (!requestId || !UUID.test(requestId)) return new NextResponse(null, { status: 200 });

  // Which company's signing secret to check against.
  const db = createAdminClient();
  const { data: leave } = await db
    .from("leave_requests")
    .select("organization_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!leave) return new NextResponse("Unauthorized", { status: 401 });

  const secret = await loadSlackSigningSecret(leave.organization_id);
  const verified =
    !!secret &&
    verifySlackSignature({
      rawBody,
      timestamp: req.headers.get("x-slack-request-timestamp"),
      signature: req.headers.get("x-slack-signature"),
      secret,
    });
  if (!verified) return new NextResponse("Unauthorized", { status: 401 });

  // ---- Verified from here on. ----

  const slackUserId = payload.user?.id ?? "";
  const respond = (text: string) => replyPrivately(payload, text);

  if (!(await loadSlackApprovalConfig(leave.organization_id))) {
    await respond(`Approving in Slack is switched off. Decide it in Blackbird Leave instead: ${SITE}/admin/requests`);
    return new NextResponse(null, { status: 200 });
  }

  const approver = await findSlackApprover(requestId, slackUserId);
  if (!approver) {
    await respond("Only the admins this request was sent to can decide it from Slack.");
    return new NextResponse(null, { status: 200 });
  }

  const view = await loadApprovalView(requestId);
  if (!view) return new NextResponse(null, { status: 200 });

  // ---- Approve: decide straight away. ----
  if (payload.type === "block_actions" && action?.action_id === APPROVE_ACTION) {
    if (view.status !== "pending") {
      after(() => refreshSlackApprovalMessages(requestId));
      await respond(alreadyDecided(view.status));
      return new NextResponse(null, { status: 200 });
    }

    after(async () => {
      const result = await decideLeaveRequest({
        supabase: db,
        admin: approver,
        id: requestId,
        action: "approve",
      });
      if (!result.ok) {
        await respond(`Couldn't approve it: ${result.error}`);
        await refreshSlackApprovalMessages(requestId);
      }
    });
    return new NextResponse(null, { status: 200 });
  }

  // ---- Reject: ask for an optional note first, as the website does. ----
  if (payload.type === "block_actions" && action?.action_id === REJECT_ACTION) {
    if (view.status !== "pending") {
      after(() => refreshSlackApprovalMessages(requestId));
      await respond(alreadyDecided(view.status));
      return new NextResponse(null, { status: 200 });
    }

    const config = await loadSlackApprovalConfig(leave.organization_id);
    try {
      // Has to happen before we answer: a trigger_id is only good for 3 seconds.
      await callSlack(config!.token, "views.open", {
        trigger_id: payload.trigger_id,
        view: buildRejectModal(view),
      });
    } catch (e) {
      await respond(e instanceof Error ? e.message : "Couldn't open the reject form. Try again.");
    }
    return new NextResponse(null, { status: 200 });
  }

  // ---- The reject form was submitted. ----
  if (payload.type === "view_submission" && payload.view?.callback_id === REJECT_MODAL) {
    if (view.status !== "pending") {
      after(() => refreshSlackApprovalMessages(requestId));
      return NextResponse.json({
        response_action: "errors",
        errors: { [NOTE_BLOCK]: alreadyDecided(view.status) },
      });
    }

    const note = payload.view.state?.values?.[NOTE_BLOCK]?.[NOTE_INPUT]?.value?.trim() || null;

    after(async () => {
      const result = await decideLeaveRequest({
        supabase: db,
        admin: approver,
        id: requestId,
        action: "reject",
        note,
      });
      if (!result.ok) {
        // The form has closed by now, so say it in the DM.
        const config = await loadSlackApprovalConfig(leave.organization_id);
        if (config) {
          await callSlack(config.token, "chat.postMessage", {
            channel: slackUserId,
            text: `Couldn't reject ${view.employeeName}'s request: ${result.error}`,
          }).catch(() => {});
        }
        await refreshSlackApprovalMessages(requestId);
      }
    });

    // An empty 200 closes the form.
    return new NextResponse(null, { status: 200 });
  }

  return new NextResponse(null, { status: 200 });
}

type Payload = {
  type?: string;
  user?: { id?: string };
  trigger_id?: string;
  response_url?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: { values?: Record<string, Record<string, { value?: string | null }>> };
  };
};

/** Slack sends `payload=<json>`, form-encoded. */
function parsePayload(rawBody: string): Payload | null {
  try {
    const json = new URLSearchParams(rawBody).get("payload");
    return json ? (JSON.parse(json) as Payload) : null;
  } catch {
    return null;
  }
}

function requestIdFrom(payload: Payload): string | null {
  if (payload.type === "block_actions") return payload.actions?.[0]?.value ?? null;
  if (payload.type === "view_submission") {
    try {
      return (JSON.parse(payload.view?.private_metadata ?? "{}") as { id?: string }).id ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * A reply only the person who pressed the button sees.
 *
 * Uses the press's own `response_url`, which needs no token and no scope.
 */
async function replyPrivately(payload: Payload, text: string): Promise<void> {
  if (!payload.response_url) return;
  await fetch(payload.response_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_type: "ephemeral", replace_original: false, text }),
  }).catch((e) => console.warn("[slack-interactions] reply failed:", e));
}

function alreadyDecided(status: string): string {
  return status === "cancelled"
    ? "This request was cancelled, so there's nothing to decide."
    : `This request was already ${status}.`;
}
