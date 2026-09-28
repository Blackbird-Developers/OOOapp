import {
  forgetToken,
  getAccessTokenFor,
  GoogleAuthError,
  type GoogleCredentials,
} from "@/lib/google-auth";

/**
 * The two Gmail calls this app makes: read a mailbox vacation responder, and
 * write one. Nothing else in the Gmail API is reachable with the scope the
 * service account holds.
 *
 * Server-only.
 */

const VACATION_URL = "https://gmail.googleapis.com/gmail/v1/users/me/settings/vacation";

/**
 * Gmail VacationSettings, as the API defines it.
 *
 * `startTime` and `endTime` are epoch MILLISECONDS carried as strings — an
 * int64 the JSON mapping renders as a string, so sending a number works by
 * luck and sending seconds silently books the responder for 1970.
 */
export type VacationSettings = {
  enableAutoReply: boolean;
  responseSubject?: string;
  responseBodyPlainText?: string;
  responseBodyHtml?: string;
  /** Reply only to people in the mailbox own contacts. */
  restrictToContacts?: boolean;
  /** Reply only to senders inside the Workspace domain. */
  restrictToDomain?: boolean;
  startTime?: string;
  endTime?: string;
};

export class GmailError extends Error {
  readonly status: number;
  /** True when retrying cannot help — permission, or a mailbox that is gone. */
  readonly permanent: boolean;

  constructor(message: string, opts: { status: number; permanent?: boolean }) {
    super(message);
    this.name = "GmailError";
    this.status = opts.status;
    this.permanent = opts.permanent ?? opts.status < 500;
  }
}

/** The responder currently set on `mailbox`, whoever set it. */
export async function getVacation(
  mailbox: string,
  credentials: GoogleCredentials
): Promise<VacationSettings> {
  return call(mailbox, credentials, { method: "GET" });
}

/**
 * Replace the responder on `mailbox`.
 *
 * A full replacement, not a merge — the API has no PATCH here, so anything
 * left out of `settings` is cleared. Every caller therefore has to send the
 * complete desired state.
 */
export async function putVacation(
  mailbox: string,
  credentials: GoogleCredentials,
  settings: VacationSettings
): Promise<VacationSettings> {
  return call(mailbox, credentials, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
}

async function call(
  mailbox: string,
  credentials: GoogleCredentials,
  init: RequestInit
): Promise<VacationSettings> {
  const token = await getAccessTokenFor(mailbox, credentials);

  let res: Response;
  try {
    res = await fetch(VACATION_URL, {
      ...init,
      headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` },
    });
  } catch (e) {
    throw new GmailError(
      `Could not reach Gmail: ${e instanceof Error ? e.message : "network error"}`,
      { status: 0, permanent: false }
    );
  }

  if (res.ok) return (await res.json().catch(() => ({}))) as VacationSettings;

  // A token that has gone stale on Google side would otherwise be handed out
  // from the cache until it expired on our clock. Drop it so the next attempt
  // mints a fresh one rather than repeating the same rejected call.
  if (res.status === 401) forgetToken(mailbox);

  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string };
  };
  throw new GmailError(explain(res.status, body.error?.message, mailbox), {
    status: res.status,
    // 429 and 5xx are worth another attempt later; everything else needs a
    // person to change something first.
    permanent: res.status !== 429 && res.status < 500,
  });
}

/**
 * Gmail errors, translated into the sentence that names the fix.
 *
 * 403 is the one that matters: it is what a Cloud project with the Gmail API
 * switched off returns, and it is indistinguishable from a scope problem
 * unless the message is read. Both are one console page away, so the text
 * names both rather than guessing.
 */
function explain(status: number, message: string | undefined, mailbox: string): string {
  const detail = message ?? `HTTP ${status}`;

  switch (status) {
    case 403:
      return /disabled|not been used|enable/i.test(detail)
        ? `Gmail refused the call (${detail}). The Gmail API is most likely not enabled on the Google Cloud project — open APIs & Services → Library → Gmail API → Enable, then try again.`
        : `Gmail refused the call for ${mailbox} (${detail}). Check the domain-wide delegation lists the scope https://www.googleapis.com/auth/gmail.settings.basic.`;
    case 404:
      return `Gmail has no mailbox for ${mailbox} (${detail}).`;
    case 429:
      return `Gmail is rate-limiting this app (${detail}). It will be retried.`;
    default:
      return `Gmail returned ${status} for ${mailbox} (${detail}).`;
  }
}

/** One readable sentence from whatever the Google layers threw. */
export function describeGoogleError(e: unknown): string {
  if (e instanceof GmailError || e instanceof GoogleAuthError) return e.message;
  return e instanceof Error ? e.message : "Unknown error talking to Google.";
}

/** Whether an error will keep failing until somebody changes a setting. */
export function isPermanent(e: unknown): boolean {
  if (e instanceof GmailError || e instanceof GoogleAuthError) return e.permanent;
  return false;
}
