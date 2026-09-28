import { createAdminClient } from "@/lib/supabase/admin";
import { isBlackbird } from "@/lib/org";

/**
 * Configuration for the Gmail auto-reply integration.
 *
 * Same shape as its calendar and Slack neighbours: one `integration_settings`
 * row is authoritative and the admin page renders whatever it says. Unlike
 * Slack the credential is NOT in the row — a service account private key
 * belongs in the deployment environment, not in a database an admin UI can
 * read back — so `connected` here means "an admin switched this on" and the
 * key is checked separately.
 *
 * Server-only: uses the service-role client.
 */

export const AUTO_REPLY_INTEGRATION_ID = "gmail";

export type AutoReplySettings = {
  /** Master switch. Off means no mailbox is ever written to. */
  connected: boolean;
  /**
   * Reply only to senders inside the Workspace domain.
   *
   * Off by default, which is the whole point: a client emailing in is exactly
   * who most needs to be told who to talk to instead.
   */
  restrictToDomain: boolean;
  /**
   * Where to send people when nobody in the group is available.
   *
   * The Hierarchy groups answer this most of the time, but not always: a
   * two-person group where both are away, or somebody in no group at all,
   * would otherwise leave the reply with no one to name. A shared address
   * (hello@, or the account manager) is the honest answer there.
   */
  fallbackEmail: string | null;
  /** An extra sentence the admin appends to every reply. Optional. */
  extraNote: string | null;
  /** A settings row exists, so the defaults below are no longer in charge. */
  managedInApp: boolean;
};

type Row = { connected: boolean; config: Record<string, unknown> | null };

/**
 * Where a reply points when no group-mate can: the shared art@ inbox. Always
 * set, so every reply names somebody. An admin can swap it for another address;
 * clearing the field comes back here rather than to naming nobody.
 */
export const DEFAULT_FALLBACK_EMAIL = "art@blackbird.marketing";

/** Blackbird's own fallback address; any other company starts with none. */
function defaultFallbackFor(orgId: string): string | null {
  return isBlackbird(orgId) ? DEFAULT_FALLBACK_EMAIL : null;
}

const DEFAULTS = {
  restrictToDomain: false,
  extraNote: null as string | null,
};

/** Keeps one admin from pasting an essay into every employee auto-reply. */
export const EXTRA_NOTE_MAX = 280;

async function loadRow(orgId: string): Promise<Row | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("integration_settings")
    .select("connected, config")
    .eq("organization_id", orgId)
    .eq("id", AUTO_REPLY_INTEGRATION_ID)
    .maybeSingle();

  if (error) {
    // Almost certainly migration 014 not run yet. Degrade to "switched off"
    // rather than take the Integrations page down with it.
    console.error("[auto-reply] could not read integration_settings:", error.message);
    return null;
  }
  return (data as Row | null) ?? null;
}

export async function loadAutoReplySettings(orgId: string): Promise<AutoReplySettings> {
  const row = await loadRow(orgId);
  const config = row?.config ?? null;

  const note = config?.extraNote;
  const fallback = config?.fallbackEmail;

  return {
    // Defaults to OFF, for the same reason the calendar integration does and
    // more so: switching this on starts writing into people personal
    // mailboxes. That is a decision somebody makes, never a default.
    connected: row?.connected ?? false,
    restrictToDomain:
      typeof config?.restrictToDomain === "boolean"
        ? config.restrictToDomain
        : DEFAULTS.restrictToDomain,
    fallbackEmail:
      typeof fallback === "string" && fallback.trim() ? fallback.trim() : defaultFallbackFor(orgId),
    extraNote: typeof note === "string" && note.trim() ? note.trim() : DEFAULTS.extraNote,
    managedInApp: !!row,
  };
}

export type AutoReplySettingsPatch = {
  connected?: boolean;
  restrictToDomain?: boolean;
  /** An empty string clears the fallback. */
  fallbackEmail?: string | null;
  /** An empty string clears the note. */
  extraNote?: string | null;
};

export async function saveAutoReplySettings(
  patch: AutoReplySettingsPatch,
  admin: { id: string; organization_id: string }
): Promise<{ error: string | null }> {
  const current = await loadAutoReplySettings(admin.organization_id);

  const nextNote =
    patch.extraNote === undefined
      ? current.extraNote
      : patch.extraNote?.trim().slice(0, EXTRA_NOTE_MAX) || null;

  const nextFallback =
    patch.fallbackEmail === undefined
      ? current.fallbackEmail
      : patch.fallbackEmail?.trim().toLowerCase() || null;

  const row = {
    organization_id: admin.organization_id,
    id: AUTO_REPLY_INTEGRATION_ID,
    connected: patch.connected ?? current.connected,
    config: {
      restrictToDomain: patch.restrictToDomain ?? current.restrictToDomain,
      fallbackEmail: nextFallback,
      extraNote: nextNote,
    },
    updated_at: new Date().toISOString(),
    updated_by: admin.id,
  };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("integration_settings")
    .upsert(row, { onConflict: "organization_id,id" });
  if (error) console.error("[auto-reply] could not save integration_settings:", error.message);
  return { error: error?.message ?? null };
}
