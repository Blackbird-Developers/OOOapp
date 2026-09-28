import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Organizations: each company using the app is one, and every row in the
 * database belongs to exactly one (migration 015).
 *
 * The user-session client is scoped to the caller's organization by RLS. The
 * service-role client is not: every query made with it has to filter by
 * `organization_id` itself, which is why the loaders in lib/ take an orgId.
 */

/**
 * Blackbird Marketing, the company the app was built for. Migration 015 gives
 * it this fixed id so the app can tell it apart: the environment-variable
 * fallbacks for Slack and the Gmail auto-reply's Workspace delegation belong
 * to Blackbird alone, never to a company that signs up later.
 */
export const BLACKBIRD_ORG_ID = "00000000-0000-4000-8000-000000000001";

export function isBlackbird(orgId: string | null | undefined): boolean {
  return orgId === BLACKBIRD_ORG_ID;
}

/**
 * Whether a person belongs to a company. For routes that take somebody's id
 * from the request and then read or write their rows with the service role,
 * which RLS would not stop.
 */
export async function isInOrganization(userId: string, orgId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return !!data;
}
