import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { unverifiedResponse } from "@/lib/verification";
import {
  EXTRA_NOTE_MAX,
  saveAutoReplySettings,
  type AutoReplySettingsPatch,
} from "@/lib/auto-reply-settings";
import { clearAllAutoReplies } from "@/lib/auto-reply";
import { googleCredentials } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

/**
 * Switch the Gmail auto-reply on, reconfigure it, and switch it off.
 *
 * Connecting refuses without credentials, which the Slack and calendar routes
 * have no equivalent of. Those two fail visibly when misconfigured — a digest
 * that never posts, an invitation that never arrives. This one fails where
 * nobody is looking: an admin would see "Connected" on the card while every
 * mailbox stayed silent, and only learn otherwise from a client who never got
 * an answer.
 */

/** Connect: start setting out-of-office replies on approved leave. */
export async function POST() {
  const admin = await requireAdmin();
  const locked = await unverifiedResponse(admin.organization_id, "turning on out-of-office replies");
  if (locked) return locked;

  if (!googleCredentials(admin.organization_id)) {
    return NextResponse.json(
      {
        error:
          "This deployment has no Google service account. Set GOOGLE_SA_CLIENT_EMAIL and GOOGLE_SA_PRIVATE_KEY from the service account JSON key, then try again. See README section 12.",
      },
      { status: 400 }
    );
  }

  const { error } = await saveAutoReplySettings({ connected: true }, admin);
  if (error) return NextResponse.json({ error: saveFailed(error) }, { status: 500 });

  return NextResponse.json({ ok: true });
}

const updateSchema = z
  .object({
    restrict_to_domain: z.boolean().optional(),
    fallback_email: z.string().trim().email().or(z.literal("")).optional(),
    extra_note: z.string().max(EXTRA_NOTE_MAX).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

/** Edit who gets a reply, where to send them, and the closing line. */
export async function PATCH(req: Request) {
  const admin = await requireAdmin();

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);

  const patch: AutoReplySettingsPatch = {
    restrictToDomain: parsed.data.restrict_to_domain,
    fallbackEmail: parsed.data.fallback_email,
    extraNote: parsed.data.extra_note,
  };

  const { error } = await saveAutoReplySettings(patch, admin);
  if (error) return NextResponse.json({ error: saveFailed(error) }, { status: 500 });

  // Existing responders keep whatever wording they were written with until the
  // next change to that person leave. Rewriting every mailbox on a settings
  // save would be a company-wide fan-out behind an innocuous Save button, and
  // the wording of a reply already running is rarely the urgent part.
  return NextResponse.json({ ok: true });
}

/**
 * Disconnect: stop writing, and take down what is already up.
 *
 * Deliberately unlike the calendar integration, which leaves entries in place.
 * A calendar entry records a real day off; a responder is the app speaking in
 * somebody voice to everyone who writes in, so switching the feature off has
 * to actually silence it.
 */
export async function DELETE() {
  const admin = await requireAdmin();

  const { error } = await saveAutoReplySettings({ connected: false }, admin);
  if (error) return NextResponse.json({ error: saveFailed(error) }, { status: 500 });

  // After the switch, never before: if clearing fails halfway the integration
  // is already off, so nothing new goes up while the failures are sorted out.
  const { cleared, failed } = await clearAllAutoReplies(admin.organization_id);

  return NextResponse.json({
    ok: true,
    cleared,
    failed,
    message:
      failed > 0
        ? `Disconnected. ${cleared} auto-repl${cleared === 1 ? "y" : "ies"} switched off, ${failed} could not be reached — those mailboxes stop replying when their leave ends.`
        : cleared > 0
          ? `Disconnected. ${cleared} active auto-repl${cleared === 1 ? "y was" : "ies were"} switched off.`
          : "Disconnected. No auto-replies were active.",
  });
}

function badRequest(error: z.ZodError): NextResponse {
  const message = error.issues[0]?.message ?? "Invalid input";
  return NextResponse.json({ error: message }, { status: 400 });
}

function saveFailed(error: string): string {
  return `Couldn't save the settings (${error}). If this is a fresh deploy, run supabase/migrations/014_gmail_auto_reply.sql.`;
}
