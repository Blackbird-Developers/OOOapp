import { createAdminClient } from "@/lib/supabase/admin";

export const ANNUAL_MIN_NOTICE_KEY = "annual_min_notice_days";

/**
 * Minimum calendar days of advance notice an employee must give when
 * requesting annual leave. 0 = no minimum. Read via the service-role client
 * so the employee request path can see it regardless of RLS; fails open to 0
 * if the settings table doesn't exist yet (migration 008 not run).
 */
export async function getAnnualMinNoticeDays(): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", ANNUAL_MIN_NOTICE_KEY)
    .maybeSingle();
  if (error) {
    console.warn("settings read skipped:", error.message);
    return 0;
  }
  const n = Number(data?.value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** "7" → "1 week", "14" → "2 weeks", "3" → "3 days". */
export function formatNoticeDays(days: number): string {
  if (days % 7 === 0 && days >= 7) {
    const weeks = days / 7;
    return `${weeks} week${weeks === 1 ? "" : "s"}`;
  }
  return `${days} day${days === 1 ? "" : "s"}`;
}
