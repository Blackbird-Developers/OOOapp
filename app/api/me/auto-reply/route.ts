import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAutoReplySettings } from "@/lib/auto-reply-settings";
import { syncAutoReplyFor } from "@/lib/auto-reply";

export const dynamic = "force-dynamic";

/**
 * The caller own auto-reply preference.
 *
 * Always scoped to `requireUser()` — the id is never taken from the request,
 * so there is no way to switch a colleague auto-reply on or off. The one
 * setting an employee has over this feature is whether it applies to them at
 * all, which is the point: the app writes into their personal mailbox, and
 * that has to be refusable by the person whose mailbox it is.
 */

/** Whether the feature applies to them, and whether they have opted out. */
export async function GET() {
  const me = await requireUser();

  const settings = await loadAutoReplySettings(me.organization_id);
  if (!settings.connected) return NextResponse.json({ enabled: false });

  const supabase = createAdminClient();
  const [{ data: profile }, { data: state }] = await Promise.all([
    supabase.from("profiles").select("auto_reply_opt_out").eq("id", me.id).maybeSingle(),
    supabase
      .from("auto_reply_state")
      .select("enabled, end_time")
      .eq("user_id", me.id)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    enabled: true,
    optedOut: !!profile?.auto_reply_opt_out,
    // So the account page can say "it is replying right now" rather than only
    // describing what would happen in the abstract.
    active: !!state?.enabled,
    activeUntil: state?.end_time ?? null,
  });
}

const schema = z.object({ opt_out: z.boolean() });

/** Opt in or out. Takes effect on their mailbox immediately. */
export async function PATCH(req: Request) {
  const me = await requireUser();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ auto_reply_opt_out: parsed.data.opt_out })
    .eq("id", me.id);

  if (error) {
    return NextResponse.json(
      {
        error: `Couldn't save that (${error.message}). If this is a fresh deploy, run supabase/migrations/014_gmail_auto_reply.sql.`,
      },
      { status: 500 }
    );
  }

  // Opting out while a reply is already running has to take it down now, not
  // at the end of their leave — otherwise the switch reads as a lie for the
  // rest of the week. Opting back in raises one if they are currently away.
  await syncAutoReplyFor(me.id).catch(() => null);

  return NextResponse.json({ ok: true, optedOut: parsed.data.opt_out });
}
