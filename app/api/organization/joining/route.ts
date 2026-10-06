import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailDomain, isClaimableDomain, newJoinCode } from "@/lib/registration";
import { unverifiedResponse } from "@/lib/verification";

const schema = z.discriminatedUnion("action", [
  // Switch the join link on, or replace it: either way a fresh code, so the
  // old link stops working the moment a new one exists.
  z.object({ action: z.literal("new_link") }),
  z.object({ action: z.literal("disable_link") }),
  z.object({ action: z.literal("domain"), enabled: z.boolean() }),
]);

/**
 * How people can join the admin's company without an invite.
 *
 * Service role, because organizations has no update policy: these columns
 * decide who gets in, so they change only through the checks here.
 */
export async function PATCH(req: Request) {
  const me = await requireAdmin();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const input = parsed.data;

  // Switching a door off is always allowed; opening one needs a verified
  // company, since anyone could walk through it.
  const opening = input.action === "new_link" || (input.action === "domain" && input.enabled);
  if (opening) {
    const locked = await unverifiedResponse(
      me.organization_id,
      input.action === "new_link" ? "creating a join link" : "letting people join by email domain"
    );
    if (locked) return locked;
  }

  let patch: Record<string, unknown>;
  if (input.action === "new_link") {
    patch = { join_code: newJoinCode() };
  } else if (input.action === "disable_link") {
    patch = { join_code: null };
  } else if (!input.enabled) {
    patch = { domain_join_enabled: false };
  } else {
    // The company's verified domain. Older companies verified before they had
    // one fall back to the admin's own. Never typed in: that would let a
    // company claim somebody else's, and everyone signing up there would be
    // offered it.
    const { data: org } = await createAdminClient()
      .from("organizations")
      .select("domain")
      .eq("id", me.organization_id)
      .maybeSingle();
    const domain = org?.domain ?? emailDomain(me.email);
    if (!isClaimableDomain(domain)) {
      return NextResponse.json(
        { error: `${domain} is a public email provider, so it can't be used to let people join. Use an admin account on your company's own domain.` },
        { status: 400 }
      );
    }
    patch = { join_domain: domain, domain_join_enabled: true };
  }

  const { error } = await createAdminClient()
    .from("organizations")
    .update(patch)
    .eq("id", me.organization_id);
  if (error) {
    // The unique index on join_domain: another company already has it.
    const taken = error.code === "23505";
    return NextResponse.json(
      { error: taken ? "Another company already lets people join with this email domain." : error.message },
      { status: taken ? 409 : 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
