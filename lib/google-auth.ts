import { createSign } from "node:crypto";
import { isBlackbird } from "@/lib/org";

/**
 * Google Workspace service-account auth, with domain-wide delegation.
 *
 * The app holds one service account that a Workspace super admin has
 * authorised to act as any user in the domain, for two scopes:
 *
 * - `gmail.settings.basic` can read and write a mailbox SETTINGS — the
 *   vacation responder among them — and cannot read, send or delete a single
 *   message.
 * - `calendar.events` can create and remove events in a person's calendar,
 *   which is how approved leave lands as a real "Out of office" event.
 *
 * Worth stating plainly, because "the app can act as any employee" sounds far
 * broader than what was actually granted.
 *
 * Each scope gets a token of its own rather than one token asking for both.
 * Google refuses an assertion outright if any scope in it is not delegated, so
 * a combined request would let a missing calendar grant take the auto-reply
 * down with it.
 *
 * Signed here rather than with `googleapis` or `google-auth-library`. This is
 * one RS256 assertion against one endpoint; the libraries bring a dependency
 * tree, a bundle cost on every serverless function, and their own opinions
 * about credential discovery, in exchange for forty lines. Same judgement the
 * app already made about iCalendar in lib/ics.ts.
 *
 * Server-only: reads the private key from the environment.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GMAIL_SETTINGS_SCOPE = "https://www.googleapis.com/auth/gmail.settings.basic";
export const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

/** Seconds before true expiry that a cached token is considered spent. */
const EXPIRY_MARGIN_SECONDS = 60;

export type GoogleCredentials = {
  clientEmail: string;
  privateKey: string;
  /** Mailboxes outside this domain are never impersonated. */
  domain: string | null;
};

export class GoogleAuthError extends Error {
  /** True when retrying cannot help — bad credentials, missing delegation. */
  readonly permanent: boolean;

  constructor(message: string, opts: { permanent?: boolean } = {}) {
    super(message);
    this.name = "GoogleAuthError";
    this.permanent = opts.permanent ?? false;
  }
}

/**
 * Credentials from the environment, or null when this deployment has none.
 *
 * The private key is stored in one env var, and every dashboard that holds one
 * mangles the newlines differently: Vercel keeps a pasted multi-line value
 * intact, while a value pasted straight out of the JSON key file arrives with
 * literal backslash-n. Both have to parse, because getting this wrong produces
 * a signature error that says nothing about newlines.
 */
export function googleCredentials(orgId: string): GoogleCredentials | null {
  // The service account holds delegation over Blackbird's Workspace only. No
  // other company's mailboxes can be reached with it, and it must never try.
  if (!isBlackbird(orgId)) return null;

  const clientEmail = process.env.GOOGLE_SA_CLIENT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY;
  if (!clientEmail || !rawKey) return null;

  const privateKey = rawKey
    .trim()
    // Strip the quotes a .env file keeps around a multi-line value.
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n");

  if (!privateKey.includes("BEGIN PRIVATE KEY")) return null;

  return {
    clientEmail,
    privateKey,
    domain: process.env.GOOGLE_WORKSPACE_DOMAIN?.trim().toLowerCase() || null,
  };
}

/** Whether a mailbox is one this deployment is allowed to impersonate. */
export function isImpersonatable(email: string, credentials: GoogleCredentials): boolean {
  if (!credentials.domain) return true;
  return email.trim().toLowerCase().endsWith(`@${credentials.domain}`);
}

type CachedToken = { token: string; expiresAt: number };

/**
 * One access token per impersonated mailbox and scope, reused until it is
 * nearly spent.
 *
 * Module-level, so it survives across requests within a warm serverless
 * instance and disappears with it. Approving a week of leave for a team hits
 * one mailbox a handful of times in a row; minting a fresh token for each
 * would be three extra round-trips to Google for no reason.
 */
const tokenCache = new Map<string, CachedToken>();

function cacheKey(subject: string, scope: string): string {
  return `${scope} ${subject.trim().toLowerCase()}`;
}

/**
 * An access token that acts as `subjectEmail`, for one scope.
 *
 * Fails loudly and specifically, because the two realistic failures look
 * identical from the call site and have completely different fixes: the
 * delegation was never authorised in the Admin console, or the Gmail API was
 * never enabled on the Cloud project.
 */
export async function getAccessTokenFor(
  subjectEmail: string,
  credentials: GoogleCredentials,
  scope: string = GMAIL_SETTINGS_SCOPE
): Promise<string> {
  const subject = subjectEmail.trim().toLowerCase();
  const now = Math.floor(Date.now() / 1000);

  const cached = tokenCache.get(cacheKey(subject, scope));
  if (cached && cached.expiresAt - EXPIRY_MARGIN_SECONDS > now) return cached.token;

  const assertion = signAssertion(subject, credentials, now, scope);

  let res: Response;
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
  } catch (e) {
    throw new GoogleAuthError(
      `Could not reach Google to authenticate: ${e instanceof Error ? e.message : "network error"}`
    );
  }

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !body.access_token) {
    throw new GoogleAuthError(explainTokenError(body, subject, scope), {
      permanent: PERMANENT_ERRORS.has(body.error ?? ""),
    });
  }

  tokenCache.set(cacheKey(subject, scope), {
    token: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600),
  });
  return body.access_token;
}

/** Forget a mailbox token — used when Google rejects one as unauthorised. */
export function forgetToken(subjectEmail: string, scope: string = GMAIL_SETTINGS_SCOPE): void {
  tokenCache.delete(cacheKey(subjectEmail, scope));
}

/**
 * OAuth errors that will keep failing until somebody changes a setting in a
 * Google console. Retrying these wastes a call and buries the real cause.
 */
const PERMANENT_ERRORS = new Set([
  "unauthorized_client",
  "invalid_client",
  "invalid_grant",
  "access_denied",
]);

/**
 * Turn Google terse OAuth errors into the sentence that names the fix.
 *
 * These are the messages an admin reads on the Integrations card when the
 * setup is half-done, so each one points at the console page to open.
 */
function explainTokenError(
  body: { error?: string; error_description?: string },
  subject: string,
  scope: string
): string {
  const detail = body.error_description ?? body.error ?? "unknown error";

  switch (body.error) {
    case "unauthorized_client":
      return `Google refused the delegation (${detail}). In the Google Admin console, under Security → Access and data control → API controls → Manage domain-wide delegation, check that this app client ID is listed with the scope ${scope}. A newly added delegation can also take a few minutes to take effect.`;
    case "invalid_grant":
      return `Google rejected the request to act as ${subject} (${detail}). That address usually either does not exist in this Workspace or has no mailbox.`;
    case "invalid_client":
      return `Google did not recognise the service account (${detail}). Check GOOGLE_SA_CLIENT_EMAIL and GOOGLE_SA_PRIVATE_KEY match the JSON key you downloaded.`;
    default:
      return `Google refused to issue a token (${detail}).`;
  }
}

/** The signed JWT that is exchanged for an impersonated access token. */
function signAssertion(
  subject: string,
  credentials: GoogleCredentials,
  now: number,
  scope: string
): string {
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: credentials.clientEmail,
    // The mailbox being acted for. This single field is what domain-wide
    // delegation authorises, and it is why the Admin console step was needed.
    sub: subject,
    scope,
    aud: TOKEN_ENDPOINT,
    iat: now,
    // Google caps assertion lifetime at an hour and rejects anything longer.
    exp: now + 3600,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;

  let signature: string;
  try {
    signature = createSign("RSA-SHA256")
      .update(signingInput)
      .sign(credentials.privateKey, "base64url");
  } catch (e) {
    throw new GoogleAuthError(
      `Could not sign with GOOGLE_SA_PRIVATE_KEY (${e instanceof Error ? e.message : "bad key"}). Paste the private_key value from the service account JSON key file, newlines and all.`,
      { permanent: true }
    );
  }

  return `${signingInput}.${signature}`;
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
