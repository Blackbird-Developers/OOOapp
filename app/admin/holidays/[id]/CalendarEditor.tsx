"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import Field from "@/components/Field";
import Dialog from "@/components/Dialog";
import EmptyState from "@/components/EmptyState";
import Select from "@/components/Select";
import DatePicker from "@/components/DatePicker";

type Holiday = { id: string; date: string; name: string };
type CountryOption = { value: string; label: string; description: string };

/** "None" in the country picker: a calendar kept entirely by hand. */
const BY_HAND = "none";

/** Holidays that follow the moon: their dates are expected until announced. */
const LUNAR = /eid|bajram|ramadan|sacrifice|matariki/i;

export default function CalendarEditor({
  calendar,
  holidays,
  years,
  year,
  countries,
  warning,
}: {
  calendar: { id: string; name: string; preset: string | null; country: string | null };
  holidays: Holiday[];
  years: number[];
  year: number;
  countries: CountryOption[];
  /** Set when creating the calendar couldn't fill every year. */
  warning: string | null;
}) {
  const router = useRouter();
  const inYear = holidays.filter((h) => h.date.startsWith(`${year}-`));
  // Holidays already in the calendar, marked in the date pickers.
  const taken = new Map(holidays.map((h) => [h.date, h.name]));
  const countByYear = new Map<number, number>();
  for (const h of holidays) {
    const y = Number(h.date.slice(0, 4));
    countByYear.set(y, (countByYear.get(y) ?? 0) + 1);
  }

  // Settings
  const [name, setName] = useState(calendar.name);
  const [preset, setPreset] = useState(calendar.preset ?? BY_HAND);
  const [saving, setSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // The year's holidays
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(warning);
  const [editing, setEditing] = useState<{ id: string; date: string; name: string } | null>(null);
  const [clearing, setClearing] = useState(false);

  // Adding one
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");

  async function call(key: string, url: string, init: RequestInit, fallback: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    const res = await fetch(url, init);
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(json.error || fallback);
      return null;
    }
    router.refresh();
    return json;
  }

  const json = (body: unknown): RequestInit => ({
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSettingsMsg(null);
    const res = await fetch(`/api/holiday-calendars/${calendar.id}`, {
      method: "PATCH",
      ...json({ name, preset: preset === BY_HAND ? null : preset }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setSettingsMsg({ kind: "err", text: j.error || "Couldn't save. Try again." });
      return;
    }
    setSettingsMsg({ kind: "ok", text: "Saved." });
    router.refresh();
  }

  async function fillYear() {
    const result = await call(
      "fill",
      `/api/holiday-calendars/${calendar.id}/fill`,
      { method: "POST", ...json({ year }) },
      `Couldn't add ${year}'s holidays. Try again.`
    );
    if (result) {
      setNotice(
        result.added === 0
          ? `Every ${calendar.country} holiday for ${year} is already here.`
          : `Added ${result.added} holiday${result.added === 1 ? "" : "s"} for ${year}.${
              result.source === "nager" ? " They come from Nager.Date's open list, so check them over." : ""
            }`
      );
    }
  }

  async function addHoliday(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call(
      "add",
      "/api/holidays",
      { method: "POST", ...json({ calendar_id: calendar.id, date: newDate, name: newName }) },
      "Couldn't add the holiday. Try again."
    );
    if (ok) {
      setNewName("");
      setNewDate("");
      const added = Number(newDate.slice(0, 4));
      if (added !== year) goToYear(added);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const ok = await call(
      editing.id,
      "/api/holidays",
      { method: "PATCH", ...json(editing) },
      "Couldn't save the holiday. Try again."
    );
    if (ok) setEditing(null);
  }

  async function clearYear() {
    const ok = await call(
      "clear",
      `/api/holidays?calendar_id=${calendar.id}&year=${year}`,
      { method: "DELETE" },
      `Couldn't remove ${year}'s holidays. Try again.`
    );
    if (ok) setClearing(false);
  }

  function goToYear(y: number) {
    router.push(`/admin/holidays/${calendar.id}?year=${y}`, { scroll: false });
  }

  const countryOptions = [
    ...countries,
    { value: BY_HAND, label: "None, I'll add them myself", description: "Nothing is filled in automatically." },
  ];

  return (
    <div className="space-y-6">

      <section className="card p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Year" className="-mx-1 flex flex-wrap gap-1">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                role="tab"
                aria-selected={y === year}
                onClick={() => goToYear(y)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium tabular-nums transition ${
                  y === year
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                {y}
                <span className={`text-[11px] ${y === year ? "text-neutral-300" : "text-neutral-400"}`}>
                  {countByYear.get(y) ?? 0}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {calendar.preset && (
              <button type="button" className="btn-secondary w-full sm:w-auto" disabled={busy === "fill"} onClick={fillYear}>
                {busy === "fill" ? "Adding…" : inYear.length === 0 ? `Add ${calendar.country}'s ${year} holidays` : `Add missing ${year} holidays`}
              </button>
            )}
          </div>
        </div>

        {notice && (
          <div className="mb-4 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
            {notice}
          </div>
        )}

        {inYear.length === 0 ? (
          <EmptyState
            title={`No holidays in ${year}`}
            description={
              calendar.preset
                ? `Add ${calendar.country}'s public holidays for ${year} with the button above, or add your own below.`
                : "Add the days your team has off below."
            }
          />
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {inYear.map((h) => {
              const d = parseISO(h.date);
              const weekend = d.getDay() === 0 || d.getDay() === 6;
              const isEditing = editing?.id === h.id;
              return (
                <li key={h.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
                  {isEditing ? (
                    <>
                      <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-[12.5rem_1fr]">
                        <DatePicker
                          aria-label="Date"
                          value={editing.date}
                          marked={taken}
                          onChange={(date) => setEditing({ ...editing, date })}
                        />
                        <input
                          aria-label="Name"
                          className="input"
                          maxLength={100}
                          value={editing.name}
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className="btn-primary min-h-9 px-3 py-1 text-xs"
                          disabled={busy === h.id || !editing.date || !editing.name.trim()}
                          onClick={saveEdit}
                        >
                          {busy === h.id ? "Saving…" : "Save"}
                        </button>
                        <button type="button" className="btn-secondary min-h-9 px-3 py-1 text-xs" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-32 shrink-0 text-sm tabular-nums text-neutral-600">
                        {format(d, "EEE d MMM")}
                      </div>
                      <div className="min-w-0 flex-1 text-sm text-neutral-900">
                        {h.name}
                        {weekend && (
                          <span
                            className="ml-2 inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500"
                            title="Falls on a weekend, so it doesn't change any leave counts"
                          >
                            Weekend
                          </span>
                        )}
                        {LUNAR.test(h.name) && (
                          <span
                            className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                            title="Set by the moon. Move it if the announced date differs."
                          >
                            Date may move
                          </span>
                        )}
                      </div>
                      <div className="-mx-2 flex shrink-0 gap-1 sm:mx-0">
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-neutral-600 transition hover:text-neutral-900"
                          onClick={() => setEditing({ id: h.id, date: h.date, name: h.name })}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${h.name}`}
                          className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-rose-600 transition hover:text-rose-700 disabled:text-neutral-400"
                          disabled={busy === `remove:${h.id}`}
                          onClick={() =>
                            call(`remove:${h.id}`, `/api/holidays?id=${h.id}`, { method: "DELETE" }, "Couldn't remove the holiday. Try again.")
                          }
                        >
                          {busy === `remove:${h.id}` ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {inYear.length > 0 && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-rose-600 transition hover:text-rose-700"
              onClick={() => setClearing(true)}
            >
              Remove all of {year}
            </button>
          </div>
        )}

        <form onSubmit={addHoliday} className="mt-4 border-t border-neutral-200 pt-4 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-500">Add a holiday</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[13rem_1fr_auto] sm:items-end">
            <Field label="Date">
              {(p) => (
                <DatePicker
                  {...p}
                  value={newDate}
                  onChange={setNewDate}
                  marked={taken}
                  // Open on the year being looked at, not wherever today is.
                  defaultMonth={year === new Date().getFullYear() ? undefined : `${year}-01-01`}
                />
              )}
            </Field>
            <Field label="Name">
              {(p) => (
                <input
                  {...p}
                  className="input"
                  required
                  maxLength={100}
                  placeholder="e.g. Company day off"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              )}
            </Field>
            <button className="btn-primary w-full sm:w-auto" disabled={busy === "add" || !newDate}>
              {busy === "add" ? "Adding…" : "Add"}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
        )}
      </section>

      <form onSubmit={saveSettings} className="card p-4 sm:p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-500">Calendar settings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name">
            {(p) => (
              <input
                {...p}
                className="input"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Country"
            hint="Where the holidays are filled in from. Changing it keeps the holidays already here."
          >
            {(p) => (
              <Select
                {...p}
                value={preset}
                onChange={setPreset}
                searchable
                searchPlaceholder="Search countries"
                options={countryOptions}
              />
            )}
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary w-full sm:w-auto" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          {settingsMsg && (
            <span className={`text-sm ${settingsMsg.kind === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
              {settingsMsg.text}
            </span>
          )}
        </div>
      </form>

      <Dialog
        open={clearing}
        onClose={() => {
          if (busy === "clear") return;
          setClearing(false);
        }}
        title={`Remove all of ${year}?`}
        description={
          <>
            All {inYear.length} holidays in {year} will be removed from {calendar.name}.
            {calendar.preset ? ` You can add ${calendar.country}'s holidays back with one click.` : ""} Leave that's
            already booked keeps the days it was counted at.
          </>
        }
        footer={
          <>
            <button type="button" className="btn-secondary" disabled={busy === "clear"} onClick={() => setClearing(false)}>
              Keep them
            </button>
            <button type="button" className="btn-danger" disabled={busy === "clear"} onClick={clearYear}>
              {busy === "clear" ? "Removing…" : `Remove ${year}`}
            </button>
          </>
        }
      />
    </div>
  );
}
