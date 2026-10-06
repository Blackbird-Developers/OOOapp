"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import Field from "@/components/Field";
import Select from "@/components/Select";
import PolicyEditor, { type PolicyPayload } from "@/app/admin/policies/[id]/PolicyEditor";
import type { LeavePolicy } from "@/lib/leave-rules";
import { annualLeaveLaw, countryList, countryName } from "@/lib/countries";
import {
  TEAM_SIZES,
  declarationText,
  defaultCustomPolicy,
  standardAnnualDays,
  workEmailProblem,
  type CustomPolicy,
  type PolicyChoice,
} from "@/lib/signup";

/**
 * Creating a company, in three steps before the "check your inbox" email:
 *
 *   1. You       name and work email. Checked straight away: a personal
 *                address (Gmail and the like) can't create a company.
 *   2. Company   name, country, team size, the person's job title, and a
 *                declaration that they're allowed to set it up. Its exact
 *                words are kept with the company.
 *   3. Leave     the starting leave policy: the standard 20 + 20, Kosovo
 *                labour law, or build your own. Skipping gives the standard.
 *   4. Build     only for "build your own": the admin's own leave policy
 *                editor, on a page of its own like the admin page, so a
 *                policy is built here exactly as it's edited later.
 *
 * Nothing is created until the emailed link is followed.
 */

const STEPS = ["You", "Company", "Leave policy"];
const STEPS_WITH_BUILDER = [...STEPS, "Build policy"];

const TEAM_SIZE_OPTIONS = TEAM_SIZES.map((s) => ({ value: s, label: `${s} people` }));

type Preset = PolicyChoice["preset"];

export default function CompanyWizard() {
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [country, setCountry] = useState<string>("");
  const [teamSize, setTeamSize] = useState<string>("");
  const [jobTitle, setJobTitle] = useState("");
  const [authorised, setAuthorised] = useState(false);
  const [preset, setPreset] = useState<Preset>("standard");
  // What the editor shows: a starting point, then whatever was on screen when
  // the person last left it, so Back and Continue don't lose their work.
  const [draft, setDraft] = useState<{ country: string; policy: LeavePolicy } | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const countries = useMemo(() => countryList().map((c) => ({ value: c.code, label: c.name })), []);

  function go(next: number) {
    setError(null);
    setStep(next);
    // Move focus to the new step's heading, so a screen reader hears where it is.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  async function submitYou(e: React.FormEvent) {
    e.preventDefault();
    const problem = workEmailProblem(email.trim().toLowerCase());
    if (problem) return setEmailError(problem);
    setBusy(true);
    setEmailError(null);
    const res = await fetch("/api/signup/check-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setBusy(false);
    if (res && !res.ok) {
      const json = await res.json().catch(() => null);
      return setEmailError(json?.error || "Use your work email.");
    }
    // A network failure here isn't the address's fault: the final submit checks again.
    go(1);
  }

  function submitCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!country) return setError("Choose the country your company is in.");
    if (!teamSize) return setError("Choose how many people work there.");
    if (!jobTitle.trim()) return setError("Enter your job title.");
    if (!authorised) return setError("Confirm you're allowed to set this up for your company.");
    // The editor starts from the standard for this country, and starts over
    // if the country changes.
    if (!draft) {
      if (country === "XK" && preset === "standard") setPreset("kosovo");
    }
    if (draft?.country !== country) {
      setDraft({ country, policy: defaultCustomPolicy(country) });
      setEditorKey((k) => k + 1);
    }
    go(2);
  }

  async function finish(choice: PolicyChoice) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "create",
        company_name: companyName,
        country,
        team_size: teamSize,
        full_name: fullName,
        job_title: jobTitle,
        email,
        authorised,
        leave_policy: choice,
      }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError(json?.error || "Something went wrong. Please try again.");
      return;
    }
    setSentTo(email.trim());
  }

  function submitPolicy(e: React.FormEvent) {
    e.preventDefault();
    if (preset === "custom") return go(3);
    finish({ preset });
  }

  function leaveEditor(payload: PolicyPayload) {
    if (!draft) return;
    const names = new Map(draft.policy.rules.map((r) => [r.type, r.name]));
    setDraft({
      country: draft.country,
      policy: {
        ...draft.policy,
        name: payload.name,
        seniority: payload.seniority,
        firstYear: payload.firstYear,
        carryOver: payload.carryOver,
        rules: payload.rules.map((r) => ({ ...r, name: names.get(r.type) ?? r.type })),
      },
    });
    setEditorKey((k) => k + 1);
    go(2);
  }

  if (sentTo) {
    return (
      <AuthShell wide>
        <div className="card p-8 space-y-3" role="status">
          <h1 className="text-2xl font-bold tracking-tight text-brand-ink">Check your inbox</h1>
          <p className="text-sm text-neutral-600">
            We sent a link to <span className="font-medium text-neutral-900">{sentTo}</span>. Open it to
            set your password and create {companyName.trim().replace(/\.$/, "")}.
          </p>
          <p className="text-xs text-neutral-500">
            The link works for 24 hours. Nothing arrived? Check spam, or{" "}
            <button type="button" onClick={() => setSentTo(null)} className="font-medium underline">
              try again
            </button>
            .
          </p>
        </div>
      </AuthShell>
    );
  }

  const law = annualLeaveLaw(country);
  const standardDays = standardAnnualDays(country || null);

  const steps = preset === "custom" ? STEPS_WITH_BUILDER : STEPS;
  const lawHint = law && (
    <p className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
      Minimum by law in {countryName(country)}: <strong>{law.minDays} days</strong> of paid annual leave on a
      five-day week.{law.note ? ` ${law.note}` : ""} Check your local rules: this is a guide, not legal advice.
    </p>
  );

  if (step === 3 && draft) {
    return (
      <AuthShell width="3xl">
        <header className="mb-6 space-y-4">
          <StepHeader steps={steps} step={step} />
          <div>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-3xl font-semibold tracking-tight text-neutral-900 focus:outline-none"
            >
              Build your leave policy
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Everyone at {companyName.trim() || "your company"} starts on this policy. It&apos;s the same editor as in
              Leave policies, where you can change it any time and add more policies for different groups.
            </p>
          </div>
          {lawHint}
        </header>

        <PolicyEditor
          key={editorKey}
          policy={draft.policy}
          usedTypes={[]}
          draft={{
            onSubmit: (custom) => finish({ preset: "custom", custom: custom as CustomPolicy }),
            onBack: leaveEditor,
            busy,
            submitLabel: "Create company",
            error,
            annualMinimum: law?.minDays ?? null,
          }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell width="md">
      <div className="card p-8">
        <StepHeader steps={steps} step={step} />

        {step === 0 && (
          <form onSubmit={submitYou} className="space-y-5" noValidate>
            <Heading refEl={headingRef} title="Create your company">
              Set up leave tracking for your team. You&apos;ll be its first admin.
            </Heading>

            <Field label="Your name">
              {(p) => (
                <input
                  {...p}
                  required
                  maxLength={120}
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                />
              )}
            </Field>

            <Field
              label="Work email"
              hint="Your company address. Personal addresses like Gmail or Outlook.com can't create a company."
              error={emailError}
            >
              {(p) => (
                <input
                  {...p}
                  type="email"
                  required
                  className="input"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError(null);
                  }}
                  autoComplete="email"
                  placeholder="you@company.com"
                />
              )}
            </Field>

            <button className="btn-primary w-full" disabled={busy || !fullName.trim() || !email.trim()}>
              {busy ? "Checking…" : "Continue"}
            </button>

            <p className="text-xs text-neutral-500 text-center pt-2">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-neutral-900 hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={submitCompany} className="space-y-5" noValidate>
            <Heading refEl={headingRef} title="Your company">
              Where it is decides which leave laws apply.
            </Heading>

            <Field label="Company name">
              {(p) => (
                <input
                  {...p}
                  required
                  maxLength={80}
                  className="input"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  autoComplete="organization"
                  placeholder="Acme Ltd"
                />
              )}
            </Field>

            <Field label="Country">
              {(p) => (
                <Select
                  {...p}
                  value={country}
                  onChange={(v) => {
                    setCountry(v);
                    setError(null);
                  }}
                  options={countries}
                  placeholder="Choose a country"
                  searchable
                  searchPlaceholder="Search countries"
                />
              )}
            </Field>

            <Field label="Team size">
              {(p) => (
                <Select
                  {...p}
                  value={teamSize}
                  onChange={(v) => {
                    setTeamSize(v);
                    setError(null);
                  }}
                  options={TEAM_SIZE_OPTIONS}
                  placeholder="How many people work there?"
                />
              )}
            </Field>

            <Field label="Your job title" hint="For example Founder, HR Manager or Operations Lead.">
              {(p) => (
                <input
                  {...p}
                  required
                  maxLength={100}
                  className="input"
                  value={jobTitle}
                  onChange={(e) => {
                    setJobTitle(e.target.value);
                    setError(null);
                  }}
                  autoComplete="organization-title"
                />
              )}
            </Field>

            <label className="flex items-start gap-3 rounded-lg bg-neutral-100 p-3 text-sm text-neutral-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-neutral-900"
                checked={authorised}
                onChange={(e) => {
                  setAuthorised(e.target.checked);
                  setError(null);
                }}
              />
              <span>
                {declarationText(companyName, jobTitle)}
                <span className="mt-1 block text-xs text-neutral-500">
                  We keep this statement with your company, with the date and your IP address.
                </span>
              </span>
            </label>

            <ErrorBox error={error} />

            <div className="flex gap-3">
              <button type="button" className="btn-secondary" onClick={() => go(0)}>
                Back
              </button>
              <button className="btn-primary flex-1" disabled={!companyName.trim() || !jobTitle.trim()}>
                Continue
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={submitPolicy} className="space-y-5" noValidate>
            <Heading refEl={headingRef} title="Leave policy">
              How much leave people get to start with. You can change all of it later under Leave policies.
            </Heading>

            {lawHint}

            <div role="radiogroup" aria-label="Starting leave policy" className="space-y-2">
              <PolicyOption
                checked={preset === "standard"}
                onSelect={() => setPreset("standard")}
                title="Standard"
                badge={country !== "XK" ? "Default" : undefined}
              >
                {standardDays} days annual leave and 20 days sick leave a year.
                {standardDays > 20 ? " Raised from 20 to meet the legal minimum." : ""}
              </PolicyOption>
              <PolicyOption
                checked={preset === "kosovo"}
                onSelect={() => setPreset("kosovo")}
                title="Kosovo labour law"
                badge={country === "XK" ? "Suggested" : undefined}
              >
                20 annual and 20 sick days, +1 annual day every 5 years, 1.5 days a month in the first year, plus
                maternity, paternity, marriage, bereavement, blood donation and unpaid leave.
              </PolicyOption>
              <PolicyOption
                checked={preset === "custom"}
                onSelect={() => setPreset("custom")}
                title="Build your own"
              >
                Set your own allowances, rules and leave types on the next page.
              </PolicyOption>
            </div>

            <ErrorBox error={error} />

            <div className="flex gap-3">
              <button type="button" className="btn-secondary" onClick={() => go(1)} disabled={busy}>
                Back
              </button>
              <button className="btn-primary flex-1" disabled={busy}>
                {busy ? "Sending…" : preset === "custom" ? "Continue" : "Create company"}
              </button>
            </div>
            <button
              type="button"
              className="btn-ghost w-full text-xs"
              disabled={busy}
              onClick={() => finish({ preset: "standard" })}
            >
              Skip, use the standard policy
            </button>
          </form>
        )}

      </div>
    </AuthShell>
  );
}

function StepHeader({ steps, step }: { steps: string[]; step: number }) {
  return (
    <div className="mb-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-500">
        Step {step + 1} of {steps.length} · {steps[step]}
      </p>
      <div className="mt-2 flex gap-1.5" aria-hidden>
        {steps.map((s, i) => (
          <span key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-brand-ink" : "bg-neutral-200"}`} />
        ))}
      </div>
    </div>
  );
}

function Heading({
  title,
  children,
  refEl,
}: {
  title: string;
  children: ReactNode;
  refEl: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div>
      <h1 ref={refEl} tabIndex={-1} className="text-2xl font-bold tracking-tight text-brand-ink focus:outline-none">
        {title}
      </h1>
      <p className="text-sm text-neutral-500 mt-1">{children}</p>
    </div>
  );
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
      {error}
    </div>
  );
}

function PolicyOption({
  checked,
  onSelect,
  title,
  badge,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
        checked ? "border-brand-ink bg-neutral-50" : "border-neutral-200 hover:border-neutral-300"
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          checked ? "border-brand-ink" : "border-neutral-300"
        }`}
      >
        {checked && <span className="h-2 w-2 rounded-full bg-brand-ink" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-medium text-neutral-900">
          {title}
          {badge && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-neutral-500">{children}</span>
      </span>
    </button>
  );
}
