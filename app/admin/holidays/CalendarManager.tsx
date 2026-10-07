"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import Field from "@/components/Field";
import Dialog from "@/components/Dialog";
import Select, { Initials } from "@/components/Select";

export type Person = { id: string; full_name: string; email: string; memberOf: string | null };
export type CountryOption = { value: string; label: string; description: string };
export type CalendarCard = {
  id: string;
  name: string;
  isDefault: boolean;
  /** Which country it's filled from, e.g. "Kosovo"; null when kept by hand. */
  country: string | null;
  /** How many holidays it has in `year` (this year). */
  thisYear: number;
  year: number;
  next: { date: string; name: string } | null;
  /** This year or next, when there's nothing in them yet. */
  missingYears: number[];
  members: Person[];
};

/** "None" in the country picker: a calendar kept entirely by hand. */
const BY_HAND = "none";

export default function CalendarManager({
  calendars,
  people,
  followingDefault,
  countries,
  suggestedCountry,
}: {
  calendars: CalendarCard[];
  people: Person[];
  followingDefault: Person[];
  countries: CountryOption[];
  /** The company's own country, offered first. */
  suggestedCountry: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [country, setCountry] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CalendarCard | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const defaultCalendar = calendars.find((c) => c.isDefault);
  const suggested = countries.find((c) => c.value === suggestedCountry);
  const countryOptions = [
    ...(suggested ? [{ ...suggested, description: "Your company's country" }] : []),
    ...countries.filter((c) => c.value !== suggestedCountry),
    { value: BY_HAND, label: "None, I'll add them myself", description: "Starts empty." },
  ];

  function pickCountry(value: string) {
    // Name it after the country unless the admin has typed a name of their own.
    const previous = countries.find((c) => c.value === country)?.label ?? "";
    if (value !== BY_HAND && (name.trim() === "" || name === previous)) {
      setName(countries.find((c) => c.value === value)?.label.replace(/^United Kingdom: /, "") ?? name);
    }
    setCountry(value);
  }

  async function createCalendar(e: React.FormEvent) {
    e.preventDefault();
    if (!country) {
      setCreateError("Pick a country, or None to add the holidays yourself.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    const res = await fetch("/api/holiday-calendars", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, preset: country === BY_HAND ? null : country }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCreating(false);
      setCreateError(json.error || "Couldn't create the calendar. Try again.");
      return;
    }
    // Straight into its holidays, to check them over.
    router.push(`/admin/holidays/${json.id}${json.warning ? `?warning=${encodeURIComponent(json.warning)}` : ""}`);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const res = await fetch(`/api/holiday-calendars/${deleting.id}`, { method: "DELETE" });
    setDeleteBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setDeleteError(j.error || "Couldn't delete the calendar. Try again.");
      return;
    }
    setDeleting(null);
    router.refresh();
  }

  return (
    <>
      <form onSubmit={createCalendar} className="card p-4 sm:p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-500">
          Create a holiday calendar
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Country"
            hint={
              countryOptions.find((o) => o.value === country)?.description ??
              "Fills in this year's and next year's public holidays."
            }
          >
            {(p) => (
              <Select
                {...p}
                value={country}
                onChange={pickCountry}
                placeholder="Pick a country…"
                searchable
                searchPlaceholder="Search countries"
                options={countryOptions}
              />
            )}
          </Field>
          <Field label="Calendar name">
            {(p) => (
              <input
                {...p}
                className="input"
                required
                maxLength={80}
                placeholder="e.g. Kosovo, Ireland"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
        </div>
        <button className="btn-primary w-full sm:w-auto" disabled={creating}>
          {creating ? "Creating…" : "Create calendar"}
        </button>
        {createError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {createError}
          </div>
        )}
      </form>

      <div className="mt-6 space-y-4">
        {calendars.map((c) => (
          <CalendarCardView
            key={c.id}
            calendar={c}
            people={people}
            calendars={calendars}
            followingDefault={c.isDefault ? followingDefault : []}
            onDelete={() => setDeleting(c)}
          />
        ))}
      </div>

      <Dialog
        open={!!deleting}
        onClose={() => {
          if (deleteBusy) return;
          setDeleting(null);
          setDeleteError(null);
        }}
        title="Delete holiday calendar?"
        description={
          deleting ? (
            <>
              <span className="font-medium text-neutral-900">{deleting.name}</span> and its holidays will be
              removed.{" "}
              {deleting.members.length > 0
                ? `The ${deleting.members.length === 1 ? "person" : `${deleting.members.length} people`} on it will follow ${defaultCalendar?.name ?? "the default calendar"} instead. `
                : ""}
              Leave that&apos;s already booked keeps the days it was counted at.
            </>
          ) : null
        }
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              disabled={deleteBusy}
              onClick={() => {
                setDeleting(null);
                setDeleteError(null);
              }}
            >
              Keep it
            </button>
            <button type="button" className="btn-danger" disabled={deleteBusy} onClick={confirmDelete}>
              {deleteBusy ? "Deleting…" : "Delete calendar"}
            </button>
          </>
        }
      >
        {deleteError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {deleteError}
          </div>
        )}
      </Dialog>
    </>
  );
}

function CalendarCardView({
  calendar,
  people,
  calendars,
  followingDefault,
  onDelete,
}: {
  calendar: CalendarCard;
  people: Person[];
  calendars: CalendarCard[];
  followingDefault: Person[];
  onDelete: () => void;
}) {
  const router = useRouter();
  // user id being added/removed, "add", "default", or "fill"
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calendarName = new Map(calendars.map((c) => [c.id, c.name]));
  const addable = people.filter((p) => p.memberOf !== calendar.id);

  async function send(url: string, init: RequestInit, key: string, fallback: string) {
    setBusy(key);
    setError(null);
    const res = await fetch(url, init);
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || fallback);
      return false;
    }
    router.refresh();
    return true;
  }

  async function fillMissing() {
    for (const year of calendar.missingYears) {
      const ok = await send(
        `/api/holiday-calendars/${calendar.id}/fill`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ year }) },
        "fill",
        `Couldn't add ${year}'s holidays. Try again.`
      );
      if (!ok) return;
    }
  }

  const summary = [
    calendar.country ? `${calendar.country} holidays` : "Holidays added by hand",
    `${calendar.thisYear} in ${calendar.year}`,
    calendar.next ? `next: ${calendar.next.name}, ${format(parseISO(calendar.next.date), "d MMM yyyy")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="card p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-neutral-900 tracking-tight">{calendar.name}</h2>
            {calendar.isDefault && (
              <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-800">
                Default
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-1">{summary}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1 -mx-2 sm:mx-0">
          <Link
            href={`/admin/holidays/${calendar.id}`}
            className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-neutral-700 transition hover:text-neutral-900"
          >
            Edit holidays
          </Link>
          {!calendar.isDefault && (
            <>
              <button
                type="button"
                className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-neutral-600 transition hover:text-neutral-900 disabled:text-neutral-400"
                disabled={busy === "default"}
                onClick={() =>
                  send(
                    `/api/holiday-calendars/${calendar.id}/default`,
                    { method: "POST" },
                    "default",
                    "Couldn't make it the default. Try again."
                  )
                }
              >
                {busy === "default" ? "Saving…" : "Make default"}
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-rose-600 transition hover:text-rose-700"
                onClick={onDelete}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {calendar.country && calendar.missingYears.length > 0 && (
        <div className="mb-4 flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span>No holidays for {calendar.missingYears.join(" or ")} yet.</span>
          <button
            type="button"
            className="btn-secondary min-h-9 shrink-0 px-3 py-1 text-xs"
            disabled={busy === "fill"}
            onClick={fillMissing}
          >
            {busy === "fill" ? "Adding…" : `Add ${calendar.country}'s holidays`}
          </button>
        </div>
      )}

      {calendar.members.length > 0 && (
        <ul className="flex flex-wrap gap-2 mb-4">
          {calendar.members.map((m) => (
            <li
              key={m.id}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 pl-3 pr-1.5 py-1 text-sm text-neutral-800"
            >
              <span>{m.full_name}</span>
              <button
                type="button"
                aria-label={`Remove ${m.full_name} from ${calendar.name}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-700 disabled:opacity-50"
                disabled={busy === m.id}
                onClick={() =>
                  send(
                    `/api/holiday-calendars/members?user_id=${m.id}`,
                    { method: "DELETE" },
                    m.id,
                    "Couldn't remove them. Try again."
                  )
                }
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <line x1="1" y1="1" x2="9" y2="9" />
                  <line x1="9" y1="1" x2="1" y2="9" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {calendar.isDefault && (
        <p className="text-xs text-neutral-500 mb-4">
          {followingDefault.length === 0
            ? "Everyone has been added to a calendar, so nobody follows this one by default."
            : `Also applies to everyone not added to a calendar: ${followingDefault.map((p) => p.full_name).join(", ")}.`}
        </p>
      )}
      {!calendar.isDefault && calendar.members.length === 0 && (
        <p className="text-xs text-neutral-500 mb-4">Nobody follows this calendar yet.</p>
      )}

      {addable.length > 0 ? (
        <Select
          value=""
          aria-label={`Add a person to ${calendar.name}`}
          placeholder={busy === "add" ? "Adding…" : "Add a person…"}
          disabled={busy === "add"}
          searchable
          searchPlaceholder="Search people"
          options={addable.map((p) => ({
            value: p.id,
            label: p.full_name,
            description: p.memberOf ? `Moves from ${calendarName.get(p.memberOf) ?? "another calendar"}` : p.email,
            leading: <Initials name={p.full_name} />,
          }))}
          onChange={(userId) =>
            send(
              "/api/holiday-calendars/members",
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ calendar_id: calendar.id, user_id: userId }),
              },
              "add",
              "Couldn't add them. Try again."
            )
          }
        />
      ) : (
        <p className="text-xs text-neutral-500">Everyone already follows this calendar.</p>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}
    </section>
  );
}
