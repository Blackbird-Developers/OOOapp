import { requireUser } from "@/lib/auth";
import TopBar from "@/components/TopBar";
import PageTransition from "@/components/PageTransition";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireUser();
  return (
    <div className="bg-app min-h-screen">
      <TopBar profile={profile} />
      <PageTransition>{children}</PageTransition>
    </div>
  );
}
