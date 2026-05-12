import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const admin = createAdminClient();

  const { data: invite, error: inviteErr } = await admin
    .from("invites")
    .select("id, email, full_name, role, expires_at, used_at")
    .eq("token", parsed.data.token)
    .single();

  if (inviteErr || !invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.used_at) return NextResponse.json({ error: "Invite already used" }, { status: 409 });
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  // Create the auth user (auto-confirmed).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: invite.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: invite.full_name, role: invite.role },
  });

  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message ?? "Could not create user" }, { status: 500 });
  }

  // Ensure profile reflects the invited role (the trigger may default to 'employee').
  await admin
    .from("profiles")
    .upsert({
      id: created.user.id,
      email: invite.email,
      full_name: invite.full_name,
      role: invite.role,
    });

  await admin.from("invites").update({ used_at: new Date().toISOString() }).eq("id", invite.id);

  return NextResponse.json({ ok: true });
}
