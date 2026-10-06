import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailInvite } from "@/lib/email";
import { requireAdmin } from "@/lib/auth";
import { UNVERIFIED_PEOPLE_LIMIT, isVerified, peopleCount } from "@/lib/verification";

const schema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  role: z.enum(["admin", "employee"]).default("employee"),
});

export async function POST(req: Request) {
  const me = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Until the company proves its domain, it can only bring in a handful of
  // people: enough to try it out, too few to pass as somebody else's company.
  if (!(await isVerified(me.organization_id)) && (await peopleCount(me.organization_id)) >= UNVERIFIED_PEOPLE_LIMIT) {
    return NextResponse.json(
      {
        error: `Unverified companies can have up to ${UNVERIFIED_PEOPLE_LIMIT} people, including open invites. Verify your company's domain under Your account to invite more.`,
        code: "unverified",
      },
      { status: 403 }
    );
  }

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
    organization_id: me.organization_id,
    email: parsed.data.email,
    full_name: parsed.data.full_name,
    role: parsed.data.role,
    token,
    expires_at,
    created_by: me.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const inviteUrl = `${site}/invite/${token}`;

  let emailError: string | null = null;
  try {
    await emailInvite({ to: parsed.data.email, fullName: parsed.data.full_name, token });
  } catch (err) {
    emailError = err instanceof Error ? err.message : "Email send failed.";
  }

  // The invite row exists either way — return the link so an admin can share
  // it manually if email delivery is broken (unverified domain, bad API key, etc.).
  return NextResponse.json({ ok: true, inviteUrl, emailError });
}
