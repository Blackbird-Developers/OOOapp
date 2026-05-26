import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailPasswordReset } from "@/lib/email";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  // Always respond the same way so an attacker can't enumerate accounts by
  // watching for differences between known and unknown emails.
  if (!parsed.success) return NextResponse.json({ ok: true });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .eq("email", parsed.data.email.toLowerCase())
    .maybeSingle();

  if (!profile) return NextResponse.json({ ok: true });

  const token = randomBytes(24).toString("hex");
  const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { error: insertErr } = await admin.from("password_resets").insert({
    user_id: profile.id,
    token,
    expires_at,
  });
  if (insertErr) {
    // Log server-side but don't reveal anything to the client.
    console.error("[password-reset] insert failed:", insertErr);
    return NextResponse.json({ ok: true });
  }

  try {
    await emailPasswordReset({
      to: profile.email,
      fullName: profile.full_name,
      token,
    });
  } catch (err) {
    console.error("[password-reset] email send failed:", err);
  }

  return NextResponse.json({ ok: true });
}
