import Link from "next/link";
import { requireUser } from "@/lib/auth";
import ProfileEditor from "./ProfileEditor";
import CalendarFeedCard from "./CalendarFeedCard";
import { loadCalendarSettings } from "@/lib/calendar-settings";

export default async function AccountPage() {
  const profile = await requireUser();
  const backHref = profile.role === "admin" ? "/admin" : "/dashboard";

  // Checked on the server so the section is absent rather than empty when an
  // admin has the calendar integration switched off.
  const calendar = await loadCalendarSettings();
  const showFeed = calendar.connected && calendar.personalFeeds;

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

      {showFeed && (
        <section className="card mt-4 p-4 sm:p-6">
          <header className="pb-5 mb-6 border-b border-neutral-200">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-900">
              Your leave in your calendar
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Approved leave is emailed to you as a calendar invitation, and{" "}
              <span className="text-neutral-700">Google Calendar</span>,{" "}
              <span className="text-neutral-700">Apple Calendar</span> and{" "}
              <span className="text-neutral-700">Outlook&nbsp;/&nbsp;Teams</span> all file it on
              their own. Subscribe to the link below as well and your calendar keeps itself in
              step, even if you miss an email.
            </p>
          </header>

          <CalendarFeedCard />
        </section>
      )}
    </main>
  );
}
