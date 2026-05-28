"use client";

import Link from "next/link";
import { useState } from "react";

type Locale = "en" | "sq";

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

type Copy = {
  pageTitle: string;
  pageLead: string;
  langLabel: string;
  footer: React.ReactNode;
  sections: Section[];
};

const content: Record<Locale, Copy> = {
  en: {
    pageTitle: "Help & FAQ",
    pageLead: "Quick answers to the things people ask most. Click a question to expand it.",
    langLabel: "Language",
    footer: (
      <>
        Still stuck? Ask your admin directly, or head{" "}
        <Link href="/dashboard" className="text-neutral-900 underline underline-offset-4 hover:text-neutral-700">
          back to the calendar
        </Link>
        .
      </>
    ),
    sections: [
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
    ],
  },
  sq: {
    pageTitle: "Ndihmë & Pyetjet e shpeshta",
    pageLead: "Përgjigje të shpejta për gjërat që pyeten më së shumti. Kliko pyetjen për ta zgjeruar.",
    langLabel: "Gjuha",
    footer: (
      <>
        Ende ngecur? Pyet drejtpërdrejt administratorin, ose kthehu{" "}
        <Link href="/dashboard" className="text-neutral-900 underline underline-offset-4 hover:text-neutral-700">
          te kalendari
        </Link>
        .
      </>
    ),
    sections: [
      {
        id: "getting-around",
        title: "Si të orientohesh",
        articles: [
          {
            id: "request-leave",
            title: "Si të kërkoj pushim?",
            body: (
              <>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>Kliko <strong>Request leave</strong> në navigimin e sipërm.</li>
                  <li>Zgjidh datën e fillimit dhe atë të mbarimit në kalendar.</li>
                  <li>Zgjidh <strong>Annual</strong> ose <strong>Sick</strong>.</li>
                  <li>Shto një arsye nëse dëshiron (është opsionale).</li>
                  <li>Kliko <strong>Submit request</strong>.</li>
                </ol>
                <p className="mt-3">Do të kthehesh te kalendari dhe administratori yt e merr email-in menjëherë. Kërkesa shfaqet si <em>pending</em> derisa ai/ajo ta aprovojë ose ta refuzojë.</p>
              </>
            ),
          },
          {
            id: "half-days",
            title: "A mund të marr gjysmë dite?",
            body: (
              <>
                <p>Po. Te forma e kërkesës, vendos <strong>First day</strong> ose <strong>Last day</strong> në <em>Morning only</em> ose <em>Afternoon only</em>. Kjo numërohet si 0.5 ditë nga bilanci yt.</p>
                <p className="mt-2">Nëse kërkesa është për një ditë të vetme, do të shohësh vetëm një menu <em>Half-day?</em> — i njëjti koncept.</p>
              </>
            ),
          },
          {
            id: "annual-vs-sick",
            title: "Pushimi vjetor vs pushimi mjekësor",
            body: (
              <>
                <p><strong>Vjetor</strong> është pushimi i planifikuar — pushime, ditë personale, çdo gjë që e rezervon paraprakisht.</p>
                <p className="mt-2"><strong>Mjekësor</strong> është për kur je i sëmurë. Vjen nga një kuotë e veçantë, kështu që marrja e një dite mjekësore nuk zbritet nga pushimi vjetor.</p>
                <p className="mt-2">Të dyja bilancet shfaqen në faqen e kërkesës. Nëse diçka duket gabim, pyet administratorin.</p>
              </>
            ),
          },
        ],
      },
      {
        id: "visibility",
        title: "Ndjekja dhe dukshmëria",
        articles: [
          {
            id: "whos-off",
            title: "Si t'i shoh kolegët që janë me pushim?",
            body: (
              <>
                <p>Kalendari në faqen kryesore (<strong>Who's off</strong>) shfaq pushimet e aprovuara të të gjithëve për tërë vitin. Kalo mbi çdo bllok për të parë kush, kur dhe çfarë lloji.</p>
                <p className="mt-2">Shiriti në krye të faqes tregon kush është me pushim sot, dhe nëse askush nuk është, kush e ka të planifikuar pushimin brenda 14 ditëve të ardhshme.</p>
              </>
            ),
          },
          {
            id: "my-requests",
            title: "Ku i shoh kërkesat e mia?",
            body: (
              <>
                <p>Kliko <strong>My requests</strong> në navigimin e sipërm. Do të shohësh çdo kërkesë pushimi që ke dërguar, me statusin përkatës (pending, approved, rejected, cancelled).</p>
                <p className="mt-2">Një pikë e kuqe te lidhja <strong>My requests</strong> do të thotë se ka një vendim të ri që nuk e ke parë ende. Vizita e faqes e pastron atë.</p>
              </>
            ),
          },
          {
            id: "greyed-dates",
            title: "Pse një datë është e zbehur?",
            body: (
              <>
                <p>Për dy arsye:</p>
                <ul className="list-disc pl-5 space-y-1 mt-2">
                  <li>Tashmë ke <strong>dërguar një kërkesë pushimi</strong> që e mbulon atë datë (në pritje ose e aprovuar). Anuloje së pari kërkesën ekzistuese nëse dëshiron ta ndryshosh.</li>
                  <li>Është një <strong>festë publike</strong>. Festat nuk numërohen si ditë pushimi — nuk ke nevojë t'i rezervosh.</li>
                </ul>
              </>
            ),
          },
        ],
      },
      {
        id: "account",
        title: "Llogaria jote",
        articles: [
          {
            id: "edit-name",
            title: "Si ta ndryshoj emrin tim?",
            body: (
              <>
                <p>Kliko <strong>Account</strong> në navigimin e sipërm, ndrysho emrin ose mbiemrin, dhe ruaj. Ndryshimi shfaqet kudo — në kalendar, në emailet që i dërgohen administratorit, dhe në çdo kërkesë të ardhshme.</p>
                <p className="mt-2">Email-i nuk mund të ndryshohet këtu — pyet administratorin nëse të duhet të përditësohet.</p>
              </>
            ),
          },
          {
            id: "forgot-password",
            title: "Kam harruar fjalëkalimin",
            body: (
              <>
                <p>Në faqen e hyrjes (<em>login</em>), kliko <strong>Forgot password?</strong> dhe shkruaj email-in me të cilin je regjistruar. Do të marrësh një lidhje për të vendosur një fjalëkalim të ri.</p>
                <p className="mt-2">Lidhja skadon brenda një ore, ndaj përdore së shpejti. Nëse nuk e sheh email-in, kontrollo dosjen e <em>spam</em>-it.</p>
              </>
            ),
          },
        ],
      },
    ],
  },
};

export default function HelpContent() {
  const [locale, setLocale] = useState<Locale>("en");
  const copy = content[locale];

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
            {copy.pageTitle}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">{copy.pageLead}</p>
        </div>

        <LanguageToggle
          locale={locale}
          onChange={setLocale}
          label={copy.langLabel}
        />
      </header>

      {/* Keyed wrapper re-mounts on locale change, replaying the page-fade animation. */}
      <div key={locale} className="page-fade space-y-8">
        {copy.sections.map((section) => (
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
                    <span aria-hidden className="text-neutral-400 transition group-open:rotate-180">
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

      <p className="mt-10 text-sm text-neutral-500">{copy.footer}</p>
    </main>
  );
}

function LanguageToggle({
  locale,
  onChange,
  label,
}: {
  locale: Locale;
  onChange: (l: Locale) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative inline-flex shrink-0 self-center sm:self-auto rounded-full bg-neutral-100 p-1 text-sm font-medium"
    >
      {/* Sliding pill — sits behind the buttons and moves between them. */}
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out"
        style={{ transform: locale === "sq" ? "translateX(100%)" : "translateX(0)" }}
      />
      <button
        type="button"
        role="radio"
        aria-checked={locale === "en"}
        onClick={() => onChange("en")}
        className={`relative z-10 min-w-[88px] rounded-full px-4 py-1.5 transition-colors ${
          locale === "en" ? "text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
        }`}
      >
        English
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={locale === "sq"}
        onClick={() => onChange("sq")}
        className={`relative z-10 min-w-[88px] rounded-full px-4 py-1.5 transition-colors ${
          locale === "sq" ? "text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
        }`}
      >
        Shqip
      </button>
    </div>
  );
}
