import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { ANNUAL_MIN_NOTICE_KEY } from "@/lib/settings";
import { UNVERIFIED_PEOPLE_LIMIT, getVerification } from "@/lib/verification";
import SettingsForm from "./SettingsForm";
import Link from "next/link";

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
        <section className="card p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-neutral-900 tracking-tight">Company domain</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {verification.verified
                  ? `${verification.domain} is verified.`
                  : `Not verified yet. Until it is, join links, joining by email domain and integrations are locked, and you can have up to ${UNVERIFIED_PEOPLE_LIMIT} people.`}
              </p>
            </div>
            {!verification.verified && (
              <Link href="/dashboard/account#company-domain" className="btn-secondary shrink-0">
                Verify in your account
              </Link>
            )}
          </div>
        </section>
        <SettingsForm initialNoticeDays={noticeDays} />
      </div>
    </main>
  );
}
