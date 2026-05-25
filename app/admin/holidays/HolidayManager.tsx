"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Field from "@/components/Field";
import Dialog from "@/components/Dialog";
import EmptyState from "@/components/EmptyState";

type Holiday = { id: string; date: string; name: string };

export default function HolidayManager({ initialHolidays }: { initialHolidays: Holiday[] }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Holiday | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/holidays", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, name }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't add the holiday. Try again.");
      return;
    }
    setDate("");
    setName("");
    router.refresh();
  }

  async function confirmRemove() {
    if (!confirming) return;
    setRemoving(true);
    setRemoveError(null);
    const res = await fetch(`/api/holidays?id=${confirming.id}`, { method: "DELETE" });
    setRemoving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setRemoveError(j.error || "Couldn't remove the holiday. Try again.");
      return;
    }
    setConfirming(null);
    router.refresh();
  }

  return (
    <>
      <form onSubmit={add} className="card p-4 sm:p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-500">Add a holiday</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Date">
            {(p) => (
              <input {...p} type="date" className="input" required value={date} onChange={(e) => setDate(e.target.value)} />
            )}
          </Field>
          <div className="md:col-span-2">
            <Field label="Name">
              {(p) => (
                <input {...p} className="input" required placeholder="e.g. St. Patrick's Day" value={name} onChange={(e) => setName(e.target.value)} />
              )}
            </Field>
          </div>
        </div>
        <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? "Adding…" : "Add holiday"}</button>
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
        )}
      </form>

      <div className="card p-4 sm:p-6 mt-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-base font-semibold text-neutral-900 tracking-tight">Holidays this year and beyond</h2>
          <span className="text-[11px] uppercase tracking-wider font-medium text-neutral-500">
            {initialHolidays.length} total
          </span>
        </div>
        {initialHolidays.length === 0 ? (
          <EmptyState
            title="No holidays yet"
            description="Dates added here are excluded from working-day counts on every leave request. Add the year's Irish public holidays so half-day math comes out right."
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto rounded-lg border border-neutral-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50/60 text-neutral-500 border-b border-neutral-200">
                    <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Date</th>
                    <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Name</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {initialHolidays.map((h) => (
                    <tr key={h.id} className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50/40 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-neutral-700 tabular-nums">{h.date}</td>
                      <td className="py-3 px-4 text-neutral-900">{h.name}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-rose-600 transition hover:text-rose-700"
                          onClick={() => setConfirming(h)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <ul className="sm:hidden space-y-2">
              {initialHolidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-neutral-900 truncate">{h.name}</div>
                    <div className="text-xs text-neutral-500 tabular-nums">{h.date}</div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex min-h-11 shrink-0 items-center px-2 text-xs font-medium text-rose-600 transition hover:text-rose-700"
                    onClick={() => setConfirming(h)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Dialog
        open={!!confirming}
        onClose={() => {
          if (removing) return;
          setConfirming(null);
          setRemoveError(null);
        }}
        title="Remove public holiday?"
        description={
          confirming ? (
            <>
              <span className="font-medium text-neutral-900">{confirming.name}</span> on{" "}
              <span className="tabular-nums">{confirming.date}</span> will no longer be excluded from working-day counts.
            </>
          ) : null
        }
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              disabled={removing}
              onClick={() => {
                setConfirming(null);
                setRemoveError(null);
              }}
            >
              Keep it
            </button>
            <button type="button" className="btn-danger" disabled={removing} onClick={confirmRemove}>
              {removing ? "Removing…" : "Remove holiday"}
            </button>
          </>
        }
      >
        {removeError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {removeError}
          </div>
        )}
      </Dialog>
    </>
  );
}
