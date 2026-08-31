import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

const schema = z.object({
  group_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

export async function POST(req: Request) {
  await requireAdmin();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const supabase = await createServerClient();
  const { error } = await supabase.from("conflict_group_members").insert(parsed.data);
  if (error) {
    const msg = error.code === "23505" ? "They're already in this group." : error.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("group_id");
  const userId = searchParams.get("user_id");
  if (!groupId || !userId) return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("conflict_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
