import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { googleCredentials, isImpersonatable } from "@/lib/google-auth";
import { describeGoogleError, getVacation } from "@/lib/gmail";
import { previewAutoReply } from "@/lib/auto-reply";

export const dynamic = "force-dynamic";

/**
 * Prove the Google wiring, and show the admin the exact words.
 *
 * Reads the caller own mailbox settings and changes nothing. That is a real
 * end-to-end test of every piece that can be misconfigured — the private key
 * signs, Google accepts the delegation, the Gmail API is enabled on the
 * project, and the scope covers vacation settings — without writing a
 * responder into anybody mailbox to find out.
 *
 * Scoped to the caller deliberately: an admin can check their own mailbox and
 * nobody else, so this cannot become a way to read a colleague settings.
 */
export async function POST() {
  const admin = await requireAdmin();

  const preview = await previewAutoReply(admin.id, admin.full_name).catch(() => null);

  const credentials = googleCredentials();
  if (!credentials) {
    return NextResponse.json({
      ok: false,
      detail:
        "No Google service account on this deployment. Set GOOGLE_SA_CLIENT_EMAIL and GOOGLE_SA_PRIVATE_KEY from the service account JSON key.",
      preview,
    });
  }

  if (!isImpersonatable(admin.email, credentials)) {
    return NextResponse.json({
      ok: false,
      detail: `Your own address (${admin.email}) is not in the ${credentials.domain} Workspace, so it cannot be used for this check. Colleagues on a ${credentials.domain} address are unaffected.`,
      preview,
    });
  }

  try {
    const current = await getVacation(admin.email, credentials);
    return NextResponse.json({
      ok: true,
      detail: `Google accepted the delegation and returned your own mailbox settings. Your auto-reply is currently ${current.enableAutoReply ? "on" : "off"}. Nothing was changed.`,
      preview,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, detail: describeGoogleError(e), preview });
  }
}
