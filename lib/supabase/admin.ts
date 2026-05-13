import { createClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS; use only in server actions or route handlers
// for operations that need elevated privileges (e.g. inviting users).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
