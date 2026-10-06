import { randomBytes } from "crypto";
import { promises as dns } from "dns";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailDomain, isPublicEmailDomain } from "@/lib/signup";

/**
 * Whether a company has proved it owns its email domain (migration 019).
 *
 * Signing up proves the founder receives mail at the domain. Verifying
 * proves somebody in charge of the domain vouches for the company: only they
 * can add a TXT record to its DNS. Until then the company works, but the
 * features that bring in people or connect outside services stay locked.
 */

/** Unverified companies can invite this many people in total (members plus open invites). */
export const UNVERIFIED_PEOPLE_LIMIT = 10;

/** The DNS host the record goes on: the domain itself. */
export const TXT_PREFIX = "blackbird-leave-verify=";

export type Verification = {
  /** The company domain, or the admin's own when the company has none yet (older companies). */
  domain: string | null;
  verified: boolean;
  verifiedAt: string | null;
  /** The full TXT record value to add. */
  record: string | null;
};

type OrgRow = {
  domain: string | null;
  domain_verify_token: string | null;
  domain_verified_at: string | null;
};

async function loadOrg(orgId: string): Promise<OrgRow | null> {
  const { data } = await createAdminClient()
    .from("organizations")
    .select("domain, domain_verify_token, domain_verified_at")
    .eq("id", orgId)
    .maybeSingle();
  return (data as OrgRow | null) ?? null;
}

/** The domain an older company without one would verify: the admin's own, if it isn't a free provider. */
function fallbackDomain(adminEmail: string): string | null {
  const d = emailDomain(adminEmail);
  return isPublicEmailDomain(d) ? null : d;
}

export async function isVerified(orgId: string): Promise<boolean> {
  return !!(await loadOrg(orgId))?.domain_verified_at;
}

/**
 * Where an admin stands, creating the TXT token the first time it's asked
 * for so the record to add is always ready to copy.
 */
export async function getVerification(orgId: string, adminEmail: string): Promise<Verification> {
  const org = await loadOrg(orgId);
  if (!org) return { domain: null, verified: false, verifiedAt: null, record: null };
  const domain = org.domain ?? fallbackDomain(adminEmail);

  let token = org.domain_verify_token;
  if (!token && !org.domain_verified_at) {
    token = randomBytes(18).toString("base64url");
    await createAdminClient().from("organizations").update({ domain_verify_token: token }).eq("id", orgId);
  }
  return {
    domain,
    verified: !!org.domain_verified_at,
    verifiedAt: org.domain_verified_at,
    record: token ? TXT_PREFIX + token : null,
  };
}

export type VerifyResult = { ok: true } | { ok: false; status: number; error: string };

/** Look the TXT record up, and mark the company verified if it's there. */
export async function verifyDomain(orgId: string, adminEmail: string): Promise<VerifyResult> {
  const org = await loadOrg(orgId);
  if (!org) return { ok: false, status: 404, error: "Company not found." };
  if (org.domain_verified_at) return { ok: true };

  const domain = org.domain ?? fallbackDomain(adminEmail);
  if (!domain) {
    return {
      ok: false,
      status: 400,
      error: "Your company has no work email domain to verify. Sign in with an admin account on your company's own domain.",
    };
  }
  if (!org.domain_verify_token) return { ok: false, status: 409, error: "Reload the page and try again." };

  const expected = TXT_PREFIX + org.domain_verify_token;
  let records: string[] = [];
  try {
    const resolver = new dns.Resolver({ timeout: 5000, tries: 2 });
    // Long TXT values arrive in chunks; joined, they're the record as typed.
    records = (await resolver.resolveTxt(domain)).map((chunks) => chunks.join("").trim());
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code !== "ENODATA" && code !== "ENOTFOUND") {
      return { ok: false, status: 502, error: "We couldn't reach your domain's DNS just now. Try again in a minute." };
    }
  }
  if (!records.some((r) => r === expected || r === `"${expected}"`)) {
    return {
      ok: false,
      status: 400,
      error: `We couldn't find the record on ${domain} yet. DNS changes can take up to an hour to show; try again later.`,
    };
  }

  const { error } = await createAdminClient()
    .from("organizations")
    .update({ domain, domain_verified_at: new Date().toISOString() })
    .eq("id", orgId);
  if (error) {
    // The unique index: another company already has this domain.
    return error.code === "23505"
      ? { ok: false, status: 409, error: `Another company on Blackbird Leave already uses ${domain}.` }
      : { ok: false, status: 500, error: error.message };
  }
  return { ok: true };
}

/**
 * Point an unverified company at a different domain, for example its own
 * domain when the founder signed up from another one they also use. Safe to
 * type in, unlike a join domain: nothing is unlocked until the TXT record on
 * that domain proves it's theirs.
 */
export async function changeDomain(orgId: string, raw: string): Promise<VerifyResult> {
  const domain = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return { ok: false, status: 400, error: "Enter a domain such as yourcompany.com." };
  }
  if (isPublicEmailDomain(domain)) {
    return { ok: false, status: 400, error: `${domain} is a public email provider, not your company's domain.` };
  }
  const org = await loadOrg(orgId);
  if (!org) return { ok: false, status: 404, error: "Company not found." };
  if (org.domain_verified_at) {
    return { ok: false, status: 409, error: "Your domain is already verified, so it can't be changed here." };
  }
  const { error } = await createAdminClient().from("organizations").update({ domain }).eq("id", orgId);
  if (error) {
    return error.code === "23505"
      ? { ok: false, status: 409, error: `Another company on Blackbird Leave already uses ${domain}.` }
      : { ok: false, status: 500, error: error.message };
  }
  return { ok: true };
}

/** For API routes: a 403 to return when the company isn't verified, or null to carry on. */
export async function unverifiedResponse(orgId: string, what: string): Promise<NextResponse | null> {
  if (await isVerified(orgId)) return null;
  return NextResponse.json(
    { error: `Verify your company's domain before ${what}. You'll find it under Your account.`, code: "unverified" },
    { status: 403 }
  );
}

/** How many people a company has or is waiting on: members plus invites not yet used or expired. */
export async function peopleCount(orgId: string): Promise<number> {
  const admin = createAdminClient();
  const [{ count: members }, { count: invites }] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    admin
      .from("invites")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);
  return (members ?? 0) + (invites ?? 0);
}
