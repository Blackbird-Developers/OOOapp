import Link from "next/link";
import { requireUser } from "@/lib/auth";
import ProfileEditor from "./ProfileEditor";

export default async function AccountPage() {
  const profile = await requireUser();
  const backHref = profile.role === "admin" ? "/admin" : "/dashboard";

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <Link
        href={backHref}
        className="inline-flex min-h-11 items-center gap-1 px-2 -mx-2 mb-3 text-xs font-medium text-neutral-500 transition hover:text-neutral-900"
      >
        ← Back
      </Link>

      <section className="card p-4 sm:p-6">
        <header className="pb-5 mb-6 border-b border-neutral-200">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Your account</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Update your name. This is how teammates see you across the app and in emails.
          </p>
        </header>

        <ProfileEditor initialFullName={profile.full_name} email={profile.email} />
      </section>
    </main>
  );
}
