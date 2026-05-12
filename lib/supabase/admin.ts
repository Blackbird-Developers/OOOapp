import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. Use only in server actions / route handlers
// for operations that need elevated privileges (e.g. inviting users).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
