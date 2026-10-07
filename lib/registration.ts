import { createHash, randomBytes } from "crypto";
import { promises as dns } from "dns";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailAccountExists, emailCompanyExists, emailMemberJoined, emailSignupLink } from "@/lib/email";
import { welcomeNewMember } from "@/lib/onboarding";
import { POLICY_PRESETS, type PresetDefinition } from "@/lib/leave-policies";
import { countryName } from "@/lib/countries";
import {
  declarationText,
  emailDomain,
  isPublicEmailDomain,
  standardAnnualDays,
  workEmailProblem,
  type PolicyChoice,
} from "@/lib/signup";

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
const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Sign-up emails a single address can be sent per hour. The endpoint is public. */
const MAX_REQUESTS_PER_HOUR = 3;

export { emailDomain };

/**
 * Whether a company may let everyone at this domain join. Never a free
 * provider: that would offer the company to everyone who signs up with it.
 */
export function isClaimableDomain(domain: string): boolean {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) && !isPublicEmailDomain(domain);
}

/** The secret in a join link. 24 URL-safe characters. */
export function newJoinCode(): string {
  return randomBytes(18).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type SignupInput =
  | {
      mode: "create";
      companyName: string;
      country: string;
      teamSize: string;
      policy: PolicyChoice;
      jobTitle: string;
      ip: string | null;
      fullName: string;
      email: string;
    }
  | { mode: "join"; code: string; fullName: string; email: string };

export type RequestResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Start a sign-up: work out which email this person should get, and send it.
 *
 * Only three answers are ever visible to the caller besides "check your
 * inbox": too many attempts, a join link that no longer works, and (creating
 * a company) an address that isn't a work email. None says anything about
 * who has an account.
 */
export async function requestSignup(input: SignupInput): Promise<RequestResult> {
  const admin = createAdminClient();
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();

  // A company is created from an address at its own domain, one that can
  // actually receive mail. Said on the page: it's about the address as
  // typed, not about anybody's account.
  if (input.mode === "create") {
    const problem = await checkWorkEmail(email);
    if (problem) return { ok: false, status: 400, error: problem };
  }

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
    } else {
      // One company per domain: somebody at this domain already created one.
      // Said only in the email, like an existing account, so the page can't
      // be used to find out which companies are here.
      const { data: owner } = await admin
        .from("organizations")
        .select("name")
        .eq("domain", emailDomain(email))
        .maybeSingle();
      if (owner) {
        await sendQuietly(() => emailCompanyExists({ to: email, fullName, companyName: owner.name }));
        return { ok: true };
      }
    }
  }

  const token = randomBytes(24).toString("hex");
  const policy = input.mode === "create" ? startingPolicy(input.policy, input.country) : null;
  const row = joinOrg
    ? {
        kind: "join",
        organization_id: joinOrg.id,
        join_via: via,
        join_code: input.mode === "join" ? input.code : null,
      }
    : {
        kind: "create",
        company_name: (input as { companyName: string }).companyName.trim(),
        country: (input as { country: string }).country,
        team_size: (input as { teamSize: string }).teamSize,
        leave_policy: policy,
        job_title: (input as { jobTitle: string }).jobTitle.trim(),
        declaration: declarationText(
          (input as { companyName: string }).companyName,
          (input as { jobTitle: string }).jobTitle
        ),
        declared_ip: (input as { ip: string | null }).ip,
      };

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
        : {
            kind: "create" as const,
            companyName: (row as { company_name: string }).company_name,
            details: describeCompany(input as Extract<SignupInput, { mode: "create" }>, policy),
          }),
    })
  );
  return { ok: true };
}

/** Why this address can't create a company, or null if it can. */
export async function checkWorkEmail(email: string): Promise<string | null> {
  const address = email.trim().toLowerCase();
  return workEmailProblem(address) ?? (await mailDomainProblem(emailDomain(address)));
}

/**
 * Why mail to this domain can't arrive, or null. A domain with neither a
 * mail server nor an address is almost always a typo. Anything other than a
 * clear "no such record" (a slow resolver, say) lets the address through:
 * the emailed link is the real check.
 */
async function mailDomainProblem(domain: string): Promise<string | null> {
  const resolver = new dns.Resolver({ timeout: 3000, tries: 1 });
  const found = async (resolve: () => Promise<unknown[]>) => {
    try {
      return (await resolve()).length > 0;
    } catch (e) {
      return !["ENOTFOUND", "ENODATA"].includes((e as { code?: string })?.code ?? "");
    }
  };
  if (await found(() => resolver.resolveMx(domain))) return null;
  // No MX record: mail falls back to the domain's own address.
  if (await found(() => resolver.resolve4(domain))) return null;
  return `We couldn't find a mail server for @${domain}. Check the address.`;
}

type StartingPolicy = PresetDefinition & { name: string };

/**
 * The default template a new company starts with, as stored on the request
 * and applied by create_organization (migration 018). Null is the template
 * create_organization makes anyway: 20 annual and 20 sick days.
 */
export function startingPolicy(choice: PolicyChoice, country: string): StartingPolicy | null {
  const blank = POLICY_PRESETS.blank;
  if (choice.preset === "kosovo") return { name: "Kosovo labour law", ...POLICY_PRESETS.kosovo };

  if (choice.preset === "standard") {
    const annual = standardAnnualDays(country);
    if (annual === blank.rules.annual.days) return null;
    return {
      name: "Standard",
      ...blank,
      rules: { ...blank.rules, annual: { ...blank.rules.annual, days: annual } },
    };
  }

  const c = choice.custom;
  const rules: PresetDefinition["rules"] = {};
  for (const r of c.rules) {
    rules[r.type] = {
      enabled: r.type === "annual" ? true : r.enabled,
      limit: r.limit,
      days: r.limit === "unlimited" ? null : r.days,
      unit: r.unit,
      note: r.note?.trim() ? r.note.trim() : null,
    };
  }
  return { name: c.name.trim(), seniority: c.seniority, firstYear: c.firstYear, carryOver: c.carryOver, rules };
}

/** One line for the confirmation email, so the founder can see what they asked for. */
function describeCompany(input: Extract<SignupInput, { mode: "create" }>, policy: StartingPolicy | null): string {
  const annual = policy?.rules.annual?.days ?? 20;
  const sick = policy?.rules.sick?.days ?? 20;
  const name = policy?.name ?? "Standard";
  return `${countryName(input.country)} · ${input.teamSize} people · ${name} leave policy (${annual} annual, ${sick} sick days)`;
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
  country: string | null;
  team_size: string | null;
  leave_policy: StartingPolicy | null;
  job_title: string | null;
  declaration: string | null;
  declared_ip: string | null;
  created_at: string;
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
    .select("id, kind, email, full_name, company_name, country, team_size, leave_policy, job_title, declaration, declared_ip, created_at, organization_id, join_via, join_code, expires_at, used_at")
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
    // Requests made before migration 018 have no country; they get the
    // one-argument version and its standard template.
    const { data, error } = row.country
      ? await admin.rpc("create_organization", {
          org_name: row.company_name,
          org_country: row.country,
          org_team_size: row.team_size,
          policy: row.leave_policy,
          org_domain: emailDomain(row.email),
        })
      : await admin.rpc("create_organization", { org_name: row.company_name });
    if (error || !data) {
      // The unique index on domain: somebody at this domain finished first.
      if (error?.code === "23505") {
        return {
          ok: false,
          status: 409,
          error: "Your company was set up on Blackbird Leave while you were signing up. Ask its admin to invite you.",
        };
      }
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

  // What the founder confirmed, kept with the company for good.
  if (row.kind === "create" && row.declaration && row.job_title) {
    const { error: declErr } = await admin.from("organization_declarations").insert({
      organization_id: orgId,
      user_id: created.user.id,
      full_name: row.full_name,
      email: row.email,
      job_title: row.job_title,
      declaration: row.declaration,
      ip: row.declared_ip,
      declared_at: row.created_at,
    });
    if (declErr) console.error("[signup] could not store the declaration:", declErr.message);
  }

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
