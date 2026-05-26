import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  password: z.string().min(8),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: reset, error: lookupErr } = await admin
    .from("password_resets")
    .select("id, user_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!reset) return NextResponse.json({ error: "Reset link is invalid." }, { status: 404 });
  if (reset.used_at) return NextResponse.json({ error: "Reset link has already been used." }, { status: 409 });
  if (new Date(reset.expires_at) < new Date()) {
    return NextResponse.json({ error: "Reset link has expired. Request a new one." }, { status: 410 });
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(reset.user_id, {
    password: parsed.data.password,
  });
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await admin
    .from("password_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("id", reset.id);

  return NextResponse.json({ ok: true });
}
