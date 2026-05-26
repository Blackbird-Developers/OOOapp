import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import HelpContent from "./HelpContent";

export default async function HelpPage() {
  const profile = await requireUser();
  // The help center is staff-facing. Admins get bounced to their calendar.
  if (profile.role === "admin") redirect("/admin");

  return <HelpContent />;
}
