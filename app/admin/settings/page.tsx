import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { ANNUAL_MIN_NOTICE_KEY } from "@/lib/settings";
import { UNVERIFIED_PEOPLE_LIMIT, getVerification } from "@/lib/verification";
import SettingsForm from "./SettingsForm";
import DomainVerification from "./DomainVerification";

export default async function SettingsPage() {
  const me = await requireAdmin();
  const supabase = await createServerClient();
  const verification = await getVerification(me.organization_id, me.email);
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", ANNUAL_MIN_NOTICE_KEY)
    .maybeSingle();
  const n = Number(data?.value);
  const noticeDays = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">Your company, and leave rules that apply to the whole team.</p>
      </header>

      <div className="space-y-6">
        <DomainVerification verification={verification} peopleLimit={UNVERIFIED_PEOPLE_LIMIT} />
        <SettingsForm initialNoticeDays={noticeDays} />
      </div>
    </main>
  );
}
