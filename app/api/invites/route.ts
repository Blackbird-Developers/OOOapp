import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailInvite } from "@/lib/email";
import { requireAdmin } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  role: z.enum(["admin", "employee"]).default("employee"),
});

export async function POST(req: Request) {
  await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();

  // If a profile already exists for this email, just upsert the role and skip.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", parsed.data.email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });
  }

  const token = randomBytes(24).toString("hex");
  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await admin.from("invites").insert({
    email: parsed.data.email,
    full_name: parsed.data.full_name,
    role: parsed.data.role,
    token,
    expires_at,
    created_by: user!.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await emailInvite({ to: parsed.data.email, fullName: parsed.data.full_name, token });

  return NextResponse.json({ ok: true });
}
