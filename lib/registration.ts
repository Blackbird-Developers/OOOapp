import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailAccountExists, emailMemberJoined, emailSignupLink } from "@/lib/email";
import { welcomeNewMember } from "@/lib/onboarding";

/**
 * Self-service ways into the app (migration 017): creating a company, or
 * joining one through its join link or its email domain.
 *
 * Every route works the same way. The request only writes a row and emails a
 * link; following the link and setting a password is what creates the
 * account. So nothing exists for an email address until its owner has
 * clicked, and the request itself always answers "check your inbox" — whether
 * the address already has an account, or matches a company's domain, is only
 * ever said in the email, to the person who owns it.
 *
 * All of it runs on the service role: the person has no session yet.
 */

/** How long an emailed sign-up link stays good. */
const LINK_TTL_MS = 24 * 60 * 60 * 1000;

/** Sign-up emails a single address can be sent per hour. The endpoint is public. */
const MAX_REQUESTS_PER_HOUR = 3;

/**
 * Domains anybody can get an address at. Letting a company claim one would
 * offer that company to everyone who signs up with it.
 */
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com",
  "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net", "mail.com",
  "yandex.com", "zoho.com", "hey.com", "fastmail.com", "tutanota.com",
]);

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

/** Whether a company may let everyone at this domain join. */
export function isClaimableDomain(domain: string): boolean {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) && !PUBLIC_EMAIL_DOMAINS.has(domain);
}

/** The secret in a join link. 24 URL-safe characters. */
export function newJoinCode(): string {
  return randomBytes(18).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type SignupInput =
  | { mode: "create"; companyName: string; fullName: string; email: string }
  | { mode: "join"; code: string; fullName: string; email: string };

export type RequestResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Start a sign-up: work out which email this person should get, and send it.
 *
 * Only two answers are ever visible to the caller besides "check your inbox":
 * too many attempts, and a join link that no longer works. Neither says
 * anything about who has an account.
 */
export async function requestSignup(input: SignupInput): Promise<RequestResult> {
  const admin = createAdminClient();
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("signup_requests")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_REQUESTS_PER_HOUR) {
    return { ok: false, status: 429, error: "Too many attempts for this address. Try again in an hour." };
  }

  // A join link that has been replaced or switched off is the one thing worth
  // saying on the page: the person needs a new link, and a working link is
  // already proof they were given it.
  let joinOrg: { id: string; name: string } | null = null;
  if (input.mode === "join") {
    const { data } = await admin
      .from("organizations")
      .select("id, name")
      .eq("join_code", input.code)
      .maybeSingle();
    if (!data) {
      return { ok: false, status: 404, error: "This join link isn't active any more. Ask your admin for a new one." };
    }
    joinOrg = data;
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("full_name")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    await sendQuietly(() => emailAccountExists({ to: email, fullName: existing.full_name }));
    return { ok: true };
  }

  // Someone creating a company at a domain another company has opened up is
  // almost certainly a colleague who didn't know it was already here.
  let via: "link" | "domain" | null = joinOrg ? "link" : null;
  if (input.mode === "create") {
    const { data } = await admin
      .from("organizations")
      .select("id, name")
      .eq("domain_join_enabled", true)
      .eq("join_domain", emailDomain(email))
      .maybeSingle();
    if (data) {
      joinOrg = data;
      via = "domain";
    }
  }

  const token = randomBytes(24).toString("hex");
  const row = joinOrg
    ? {
        kind: "join",
        organization_id: joinOrg.id,
        join_via: via,
        join_code: input.mode === "join" ? input.code : null,
      }
    : { kind: "create", company_name: (input as { companyName: string }).companyName.trim() };

  const { error } = await admin.from("signup_requests").insert({
    ...row,
    email,
    full_name: fullName,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString(),
  });
  if (error) {
    console.error("[signup] could not save the request:", error.message);
    return { ok: false, status: 500, error: "Something went wrong. Please try again." };
  }

  await sendQuietly(() =>
    emailSignupLink({
      to: email,
      fullName,
      token,
      ...(joinOrg
        ? { kind: "join" as const, companyName: joinOrg.name, viaDomain: via === "domain" }
        : { kind: "create" as const, companyName: (row as { company_name: string }).company_name }),
    })
  );
  return { ok: true };
}

/** A mail failure must not turn into a different answer on the page. */
async function sendQuietly(send: () => Promise<void>) {
  try {
    await send();
  } catch (e) {
    console.error("[signup] email failed:", e);
  }
}

export type PendingSignup = {
  kind: "create" | "join";
  email: string;
  fullName: string;
  companyName: string;
};

type RequestRow = {
  id: string;
  kind: "create" | "join";
  email: string;
  full_name: string;
  company_name: string | null;
  organization_id: string | null;
  join_via: "link" | "domain" | null;
  join_code: string | null;
  expires_at: string;
  used_at: string | null;
};

/**
 * The request behind an emailed link, if it can still be completed. For a
 * join, that includes the door it came through still being open.
 */
async function openRequest(token: string): Promise<{ row: RequestRow; companyName: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("signup_requests")
    .select("id, kind, email, full_name, company_name, organization_id, join_via, join_code, expires_at, used_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  const row = data as RequestRow | null;
  if (!row || row.used_at || new Date(row.expires_at) < new Date()) return null;

  if (row.kind === "create") return { row, companyName: row.company_name! };

  const { data: org } = await admin
    .from("organizations")
    .select("name, join_code, join_domain, domain_join_enabled")
    .eq("id", row.organization_id!)
    .maybeSingle();
  if (!org) return null;

  const stillOpen =
    row.join_via === "link"
      ? !!org.join_code && org.join_code === row.join_code
      : org.domain_join_enabled && org.join_domain === emailDomain(row.email);
  return stillOpen ? { row, companyName: org.name } : null;
}

/** What the link page shows, or null for a link that no longer works. */
export async function loadPendingSignup(token: string): Promise<PendingSignup | null> {
  const open = await openRequest(token);
  if (!open) return null;
  return {
    kind: open.row.kind,
    email: open.row.email,
    fullName: open.row.full_name,
    companyName: open.companyName,
  };
}

export type CompleteResult = { ok: true; email: string } | { ok: false; status: number; error: string };

/**
 * Follow the emailed link: create the account, and for a new company the
 * company, with the password the person has just chosen.
 */
export async function completeSignup(token: string, password: string): Promise<CompleteResult> {
  const open = await openRequest(token);
  if (!open) {
    return { ok: false, status: 410, error: "This link has expired or has already been used. Start again to get a new one." };
  }
  const { row } = open;
  const admin = createAdminClient();

  // Claim the link first, so two clicks can't both create an account. The
  // filter on used_at is what makes the second one match nothing.
  const { data: claimed } = await admin
    .from("signup_requests")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) {
    return { ok: false, status: 410, error: "This link has already been used. Sign in instead." };
  }

  let orgId = row.organization_id;
  if (row.kind === "create") {
    const { data, error } = await admin.rpc("create_organization", { org_name: row.company_name });
    if (error || !data) {
      console.error("[signup] could not create the organization:", error?.message);
      await releaseClaim(row.id);
      return { ok: false, status: 500, error: "Couldn't create your company. Please try again." };
    }
    orgId = data as string;
  }

  const role = row.kind === "create" ? "admin" : "employee";

  // Company and role go in app_metadata, which only the service role can
  // write, and which the new-user trigger reads (migration 015).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: row.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: row.full_name },
    app_metadata: { organization_id: orgId, role },
  });

  if (createErr || !created.user) {
    // A company nobody can sign in to is worse than no company at all.
    if (row.kind === "create") await admin.from("organizations").delete().eq("id", orgId!);
    await releaseClaim(row.id);
    const taken = /already|registered|exists/i.test(createErr?.message ?? "");
    return taken
      ? { ok: false, status: 409, error: "An account with this email already exists. Sign in instead." }
      : { ok: false, status: 500, error: createErr?.message ?? "Couldn't create your account." };
  }

  await admin.from("profiles").upsert({
    id: created.user.id,
    organization_id: orgId,
    email: row.email,
    full_name: row.full_name,
    role,
  });

  if (row.kind === "join") {
    await sendQuietly(async () => {
      const { data: admins } = await admin
        .from("profiles")
        .select("email")
        .eq("organization_id", orgId!)
        .eq("role", "admin");
      const adminEmails = (admins ?? []).map((a: { email: string }) => a.email);
      if (adminEmails.length) {
        await emailMemberJoined({
          adminEmails,
          name: row.full_name,
          email: row.email,
          via: row.join_via!,
        });
      }
    });
  }

  await welcomeNewMember({ userId: created.user.id, orgId: orgId!, email: row.email, fullName: row.full_name });

  return { ok: true, email: row.email };
}

/** Let a link be tried again after a failure that wasn't the person's fault. */
async function releaseClaim(id: string) {
  await createAdminClient().from("signup_requests").update({ used_at: null }).eq("id", id);
}
