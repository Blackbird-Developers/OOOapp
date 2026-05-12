import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export default async function Home() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profile = await getProfile();
  if (profile?.role === "admin") redirect("/admin");
  redirect("/dashboard");
}
