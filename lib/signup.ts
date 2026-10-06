import { z } from "zod";
import { COUNTRY_CODES, annualLeaveLaw } from "@/lib/countries";

/**
 * What creating a company asks for, shared by the sign-up form and the
 * server so both check the same things. Nothing here touches the database.
 */

export const TEAM_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"] as const;

// ---------------------------------------------------------------------------
// Work email
// ---------------------------------------------------------------------------

/**
 * Domains anybody can get an address at. A company has to be created from
 * an address at its own domain: one at a free provider says nothing about
 * who is behind it. (Companies on Google Workspace have their own domain,
 * so this doesn't shut them out.)
 */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com",
  "msn.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "rocketmail.com", "icloud.com", "me.com",
  "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net", "gmx.de",
  "web.de", "mail.com", "yandex.com", "yandex.ru", "mail.ru", "zoho.com", "zohomail.com",
  "hey.com", "fastmail.com", "tutanota.com", "tuta.io", "qq.com", "163.com", "126.com",
  "naver.com", "inbox.com", "hushmail.com", "libero.it", "orange.fr", "t-online.de",
]);

/** Throwaway inboxes. Not complete; the emailed link is the real check. */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com",
  "temp-mail.org", "tempmail.com", "yopmail.com", "trashmail.com", "getnada.com", "dispostable.com",
  "maildrop.cc", "throwawaymail.com", "fakeinbox.com", "mintemail.com", "emailondeck.com",
  "mohmal.com", "burnermail.io", "spamgourmet.com", "moakt.com",
]);

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).trim().toLowerCase();
}

/** Includes subdomains, so mail.yahoo.com counts as yahoo.com. */
function inSet(domain: string, set: Set<string>): boolean {
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (set.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

export function isPublicEmailDomain(domain: string): boolean {
  return inSet(domain, PUBLIC_EMAIL_DOMAINS);
}

/**
 * Why this address can't create a company, or null if it can. The checks
 * that need no network; the server adds a mail-server lookup.
 */
export function workEmailProblem(email: string): string | null {
  const domain = emailDomain(email);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return "Enter a valid email address.";
  if (isPublicEmailDomain(domain)) {
    return `Use your work email. Personal addresses like @${domain} can't create a company.`;
  }
  if (inSet(domain, DISPOSABLE_EMAIL_DOMAINS)) return "Use your work email, not a temporary inbox.";
  return null;
}

// ---------------------------------------------------------------------------
// Starting leave policy
// ---------------------------------------------------------------------------

/** The types besides annual and sick a custom policy can switch on, in catalogue order. */
export const OPTIONAL_TYPES = [
  { key: "maternity", name: "Maternity leave", days: 365, unit: "calendar", limit: "per_request" },
  { key: "paternity", name: "Paternity leave", days: 3, unit: "working", limit: "per_request" },
  { key: "marriage", name: "Marriage leave", days: 5, unit: "working", limit: "per_request" },
  { key: "bereavement", name: "Bereavement leave", days: 5, unit: "working", limit: "per_request" },
  { key: "blood_donation", name: "Blood donation leave", days: 1, unit: "working", limit: "per_request" },
  { key: "unpaid", name: "Unpaid leave", days: null, unit: "working", limit: "unlimited" },
] as const;

export type OptionalTypeKey = (typeof OPTIONAL_TYPES)[number]["key"];

const halfDays = (n: number) => Math.round(n * 2) === n * 2;
const KNOWN_TYPES = ["annual", "sick", ...OPTIONAL_TYPES.map((t) => t.key)] as const;

/**
 * A policy built in the sign-up's editor: the same shape the admin editor
 * saves (app/api/leave-policies/[id]), limited to the types every new
 * company starts with, since the catalogue can't change before it exists.
 */
export const customPolicySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    seniority: z.object({
      enabled: z.boolean(),
      everyYears: z.number().int().min(1).max(50),
      extraDays: z.number().positive().max(30).refine(halfDays),
    }),
    firstYear: z.object({
      enabled: z.boolean(),
      daysPerMonth: z.number().positive().max(31),
    }),
    carryOver: z.object({
      enabled: z.boolean(),
      maxDays: z.number().positive().max(366).refine(halfDays),
      expires: z
        .string()
        .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
        .refine((md) => {
          const [m, d] = md.split("-").map(Number);
          return d <= new Date(Date.UTC(2024, m, 0)).getUTCDate();
        })
        .nullable(),
    }),
    rules: z
      .array(
        z.object({
          type: z.enum(KNOWN_TYPES),
          enabled: z.boolean(),
          limit: z.enum(["per_year", "per_request", "unlimited"]),
          days: z.number().min(0).max(1000).refine(halfDays).nullable(),
          unit: z.enum(["working", "calendar"]),
          note: z.string().max(400).nullable(),
        })
      )
      .max(KNOWN_TYPES.length),
  })
  .refine((p) => new Set(p.rules.map((r) => r.type)).size === p.rules.length, "Each type once.")
  .refine((p) => p.rules.every((r) => r.limit === "unlimited" || r.days !== null), "Days are needed.")
  .refine(
    (p) => p.rules.some((r) => r.type === "annual" && r.enabled && r.limit === "per_year" && (r.days ?? 0) <= 366),
    "Annual leave is yearly."
  );

export type CustomPolicy = z.infer<typeof customPolicySchema>;

/**
 * standard  20 annual and 20 sick days, nothing else (raised to the legal
 *           minimum where the law asks for more). Also what skipping gives.
 * kosovo    Kosovo labour law: every type, seniority and first-year leave.
 * custom    Built on the sign-up page.
 */
export const policyChoiceSchema = z.discriminatedUnion("preset", [
  z.object({ preset: z.literal("standard") }),
  z.object({ preset: z.literal("kosovo") }),
  z.object({ preset: z.literal("custom"), custom: customPolicySchema }),
]);

export type PolicyChoice = z.infer<typeof policyChoiceSchema>;

/** Annual days in the standard policy for a country: 20, or the legal minimum if that's more. */
export function standardAnnualDays(country: string | null): number {
  return Math.max(20, annualLeaveLaw(country)?.minDays ?? 0);
}

/**
 * Where the sign-up's editor starts: the standard policy for this country,
 * with the other types present but switched off. Shaped like a saved
 * template, which is what the editor loads.
 */
export function defaultCustomPolicy(country: string | null) {
  return {
    id: null,
    name: "Company policy",
    isDefault: true,
    seniority: { enabled: false, everyYears: 5, extraDays: 1 },
    firstYear: { enabled: false, daysPerMonth: 1.5 },
    carryOver: { enabled: false, maxDays: 5, expires: null as string | null },
    rules: [
      { type: "annual", name: "Annual leave", enabled: true, limit: "per_year" as const, days: standardAnnualDays(country) as number | null, unit: "working" as const, note: null as string | null },
      { type: "sick", name: "Sick leave", enabled: true, limit: "per_year" as const, days: 20 as number | null, unit: "working" as const, note: null as string | null },
      ...OPTIONAL_TYPES.map((t) => ({
        type: t.key as string,
        name: t.name as string,
        enabled: false,
        limit: t.limit as "per_year" | "per_request" | "unlimited",
        days: t.days as number | null,
        unit: t.unit as "working" | "calendar",
        note: null as string | null,
      })),
    ],
  };
}

/**
 * What the founder confirms, word for word. Shown next to the tick box and
 * stored with the company exactly as shown (organization_declarations).
 */
export function declarationText(companyName: string, jobTitle: string): string {
  const company = companyName.trim() || "this company";
  const title = jobTitle.trim() || "an employee";
  return `I confirm that I work at ${company} as ${title}, that I'm authorised to set up Blackbird Leave for ${company}, and that the details I've given are true.`;
}

export const companySignupSchema = z.object({
  company_name: z.string().trim().min(1).max(80),
  country: z.enum(COUNTRY_CODES),
  team_size: z.enum(TEAM_SIZES),
  full_name: z.string().trim().min(1).max(120),
  job_title: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  // Ticked by the person: they're allowed to set this up for the company.
  authorised: z.literal(true),
  leave_policy: policyChoiceSchema,
});
