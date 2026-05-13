import { requireAdmin } from "@/lib/auth";
import TopBar from "@/components/TopBar";
import PageTransition from "@/components/PageTransition";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireAdmin();
  return (
    <div className="bg-app min-h-screen">
      <TopBar profile={profile} />
      <PageTransition>{children}</PageTransition>
    </div>
  );
}
