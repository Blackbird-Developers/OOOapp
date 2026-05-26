import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

type Article = {
  id: string;
  title: string;
  body: React.ReactNode;
};

type Section = {
  id: string;
  title: string;
  articles: Article[];
};

const sections: Section[] = [
  {
    id: "getting-around",
    title: "Getting around",
    articles: [
      {
        id: "request-leave",
        title: "How do I request leave?",
        body: (
          <>
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>Click <strong>Request leave</strong> in the top nav.</li>
              <li>Pick your start and end date on the calendar.</li>
              <li>Choose <strong>Annual</strong> or <strong>Sick</strong>.</li>
              <li>Add a reason if you'd like (it's optional).</li>
              <li>Hit <strong>Submit request</strong>.</li>
            </ol>
            <p className="mt-3">You'll land back on the calendar and your admin gets an email straight away. Your request shows as <em>pending</em> until they approve or reject it.</p>
          </>
        ),
      },
      {
        id: "half-days",
        title: "Can I take half a day?",
        body: (
          <>
            <p>Yes. On the request form, set <strong>First day</strong> or <strong>Last day</strong> to <em>Morning only</em> or <em>Afternoon only</em>. That counts as 0.5 days against your balance.</p>
            <p className="mt-2">If your request is just one day, you'll see a single <em>Half-day?</em> dropdown — same idea.</p>
          </>
        ),
      },
      {
        id: "annual-vs-sick",
        title: "Annual leave vs sick leave",
        body: (
          <>
            <p><strong>Annual</strong> is planned time off — holidays, personal days, anything you book ahead.</p>
            <p className="mt-2"><strong>Sick</strong> is for when you're unwell. It comes out of a separate allowance, so taking a sick day doesn't eat into your annual leave.</p>
            <p className="mt-2">Both balances show on the request page. If something looks wrong, ask your admin.</p>
          </>
        ),
      },
    ],
  },
  {
    id: "visibility",
    title: "Tracking & visibility",
    articles: [
      {
        id: "whos-off",
        title: "How do I see who else is off?",
        body: (
          <>
            <p>The calendar on the main page (<strong>Who's off</strong>) shows everyone's approved leave for the year. Hover any block to see who, when, and what type.</p>
            <p className="mt-2">The strip at the top tells you who's off today, and if no one is, who's scheduled off in the next 14 days.</p>
          </>
        ),
      },
      {
        id: "my-requests",
        title: "Where do I see my own requests?",
        body: (
          <>
            <p>Click <strong>My requests</strong> in the top nav. You'll see every leave request you've ever submitted along with its status (pending, approved, rejected, cancelled).</p>
            <p className="mt-2">A red dot on the <strong>My requests</strong> link means there's a new decision you haven't looked at yet. Visiting the page clears it.</p>
          </>
        ),
      },
      {
        id: "greyed-dates",
        title: "Why is a date greyed out?",
        body: (
          <>
            <p>Two reasons:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>You've <strong>already submitted leave</strong> covering that date (pending or approved). Cancel the existing request first if you want to change it.</li>
              <li>It's a <strong>public holiday</strong>. Holidays don't count toward your leave days — you don't need to book them off.</li>
            </ul>
          </>
        ),
      },
    ],
  },
  {
    id: "account",
    title: "Your account",
    articles: [
      {
        id: "edit-name",
        title: "How do I change my name?",
        body: (
          <>
            <p>Click <strong>Account</strong> in the top nav, update your first or last name, and save. The change shows up everywhere — on the calendar, in emails to your admin, and on any future requests.</p>
            <p className="mt-2">Email can't be changed here — ask your admin if you need that updated.</p>
          </>
        ),
      },
      {
        id: "forgot-password",
        title: "I forgot my password",
        body: (
          <>
            <p>On the login page, click <strong>Forgot password?</strong> and enter the email you signed in with. You'll get a link to set a new one.</p>
            <p className="mt-2">The link expires in an hour, so use it soon. If you don't see the email, check your spam folder.</p>
          </>
        ),
      },
    ],
  },
];

export default async function HelpPage() {
  const profile = await requireUser();
  // The help center is staff-facing. Admins get bounced to their calendar.
  if (profile.role === "admin") redirect("/admin");

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Help & FAQ</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Quick answers to the things people ask most. Click a question to expand it.
        </p>
      </header>

      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section.id}>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-500 mb-3">
              {section.title}
            </h2>
            <div className="card divide-y divide-neutral-200">
              {section.articles.map((article) => (
                <details
                  key={article.id}
                  className="group px-4 sm:px-6 py-4 [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 list-none -mx-2 px-2 py-1 rounded-md min-h-11 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/10">
                    <span className="text-sm font-medium text-neutral-900">{article.title}</span>
                    <span
                      aria-hidden
                      className="text-neutral-400 transition group-open:rotate-180"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3,5 7,9 11,5" />
                      </svg>
                    </span>
                  </summary>
                  <div className="mt-3 text-sm text-neutral-700 leading-relaxed">
                    {article.body}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-10 text-sm text-neutral-500">
        Still stuck? Ask your admin directly, or head{" "}
        <Link href="/dashboard" className="text-neutral-900 underline underline-offset-4 hover:text-neutral-700">
          back to the calendar
        </Link>
        .
      </p>
    </main>
  );
}
