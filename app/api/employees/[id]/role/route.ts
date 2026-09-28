import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

const schema = z.object({ role: z.enum(["admin", "employee"]) });

/**
 * Promote someone to admin, or back to employee. The only way anyone becomes
 * an admin besides founding a company or being invited as one.
 *
 * The user-session client, so RLS keeps it to the admin's own company.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  if (id === me.id) {
    return NextResponse.json({ error: "You can't change your own role. Ask another admin." }, { status: 400 });
  }

  const supabase = await createServerClient();

  if (parsed.data.role === "employee") {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Every company needs at least one admin." }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No such person." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
