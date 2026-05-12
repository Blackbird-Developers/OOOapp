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

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, annual_allowance, sick_allowance")
    .eq("id", user.id)
    .single();
  return (data as Profile) ?? null;
}

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
