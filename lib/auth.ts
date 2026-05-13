import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "employee";
  annual_allowance: number;
  sick_allowance: number;
};

// `cache()` dedupes calls within a single server render: if requireUser
// and getProfile are both invoked while rendering one page, only one
// profile lookup happens.
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createServerClient();
  // Middleware verifies and refreshes the session each request, so reading
  // it from the cookie here (no network call) is safe and noticeably faster
  // than the round-trip getUser() makes to Supabase Auth.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, annual_allowance, sick_allowance")
    .eq("id", session.user.id)
    .single();
  return (data as Profile) ?? null;
});

export async function requireUser(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireUser();
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}
