import { createAdminClient } from "@/lib/supabase/admin";
import type { OrganizerIdentity } from "@/lib/ics";

/**
 * Configuration for the calendar integration.
 *
 * Same shape of decision as the Slack settings next door: one
 * `integration_settings` row is authoritative, and the page renders whatever
 * it says. Unlike Slack there is no credential to store — iCalendar needs no
 * token — so "connected" here means "an admin has switched this on", not "we
 * hold a key". That is the whole reason this integration is cheap to run.
 *
 * Server-only: uses the service-role client.
 */

export const CALENDAR_INTEGRATION_ID = "calendar";

export type CalendarSettings = {
  /** Master switch. Off means no invites and no working feed URLs. */
  connected: boolean;
  /** Email an .ics invitation when leave is approved. The instant path. */
  sendInvites: boolean;
  /** Offer each employee a personal subscribe-by-URL feed. The durable path. */
  personalFeeds: boolean;
  /** A settings row exists, so the defaults below are no longer in charge. */
  managedInApp: boolean;
};

type Row = { connected: boolean; config: Record<string, unknown> | null };

const DEFAULTS = { sendInvites: true, personalFeeds: true };

async function loadRow(orgId: string): Promise<Row | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("integration_settings")
    .select("connected, config")
    .eq("organization_id", orgId)
    .eq("id", CALENDAR_INTEGRATION_ID)
    .maybeSingle();

  if (error) {
    // Almost certainly migration 010 not run yet. Degrade to "switched off"
    // rather than take the Integrations page down: a missing calendar feature
    // is an inconvenience, a 500 on /admin/integrations is an outage.
    console.error("[calendar] could not read integration_settings:", error.message);
    return null;
  }
  return (data as Row | null) ?? null;
}

function readFlag(config: Record<string, unknown> | null, key: keyof typeof DEFAULTS): boolean {
  const value = config?.[key];
  return typeof value === "boolean" ? value : DEFAULTS[key];
}

export async function loadCalendarSettings(orgId: string): Promise<CalendarSettings> {
  const row = await loadRow(orgId);
  return {
    // Defaults to OFF when no row exists. Opposite of Slack, deliberately:
    // Slack could infer intent from environment variables an admin had
    // already set, whereas switching this on starts mailing every employee
    // calendar invitations. That should be somebody's decision, not a default.
    connected: row?.connected ?? false,
    sendInvites: readFlag(row?.config ?? null, "sendInvites"),
    personalFeeds: readFlag(row?.config ?? null, "personalFeeds"),
    managedInApp: !!row,
  };
}

export type CalendarSettingsPatch = {
  connected?: boolean;
  sendInvites?: boolean;
  personalFeeds?: boolean;
};

export async function saveCalendarSettings(
  patch: CalendarSettingsPatch,
  admin: { id: string; organization_id: string }
): Promise<{ error: string | null }> {
  const current = await loadCalendarSettings(admin.organization_id);

  const row = {
    organization_id: admin.organization_id,
    id: CALENDAR_INTEGRATION_ID,
    connected: patch.connected ?? current.connected,
    config: {
      sendInvites: patch.sendInvites ?? current.sendInvites,
      personalFeeds: patch.personalFeeds ?? current.personalFeeds,
    },
    updated_at: new Date().toISOString(),
    updated_by: admin.id,
  };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("integration_settings")
    .upsert(row, { onConflict: "organization_id,id" });
  if (error) console.error("[calendar] could not save integration_settings:", error.message);
  return { error: error?.message ?? null };
}

/**
 * Who the invitation comes FROM.
 *
 * Reuses the verified Resend sender, because an ORGANIZER address that does
 * not match the envelope sender is one of the surer ways to get an invite
 * dropped by Exchange or filed as spam by Gmail. RESEND_FROM is conventionally
 * `Name <address@domain>`, but a bare address is also valid, so both parse.
 */
export function organizerIdentity(): OrganizerIdentity {
  const raw = process.env.RESEND_FROM ?? "Blackbird Leave <onboarding@resend.dev>";
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].replace(/^"|"$/g, "").trim();
    return { name: name || "Blackbird Leave", email: match[2].trim() };
  }
  return { name: "Blackbird Leave", email: raw.trim() };
}
