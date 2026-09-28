import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ name: z.string().trim().min(1).max(80) });

/**
 * Rename the admin's company. Service role, because organizations has no
 * update policy: its other columns decide who can join, and change only
 * through /api/organization/joining.
 */
export async function PATCH(req: Request) {
  const me = await requireAdmin();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Give the company a name, up to 80 characters." }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from("organizations")
    .update({ name: parsed.data.name })
    .eq("id", me.organization_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
