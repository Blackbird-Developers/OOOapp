"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Holiday = { id: string; date: string; name: string };

export default function HolidayManager({ initialHolidays }: { initialHolidays: Holiday[] }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function remove(h: Holiday) {
    if (!window.confirm(`Remove ${h.name} (${h.date}) from public holidays?`)) return;
    const res = await fetch(`/api/holidays?id=${h.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Couldn't remove the holiday. Try again.");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <form onSubmit={add} className="card p-4 sm:p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">Add a holiday</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Name</label>
            <input className="input" required placeholder="e.g. St. Patrick's Day" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? "Adding…" : "Add holiday"}</button>
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
        )}
      </form>

      <div className="card p-4 sm:p-6 mt-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">Holidays this year and beyond</h2>
          <span className="text-[11px] uppercase tracking-wider font-medium text-slate-400">
            {initialHolidays.length} total
          </span>
        </div>
        {initialHolidays.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-6 py-10 text-center">
            <p className="text-sm text-slate-500">No holidays configured yet.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/60 text-slate-500 border-b border-slate-200">
                    <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Date</th>
                    <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Name</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {initialHolidays.map((h) => (
                    <tr key={h.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/40 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-slate-700 tabular-nums">{h.date}</td>
                      <td className="py-3 px-4 text-slate-900">{h.name}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          className="text-xs font-medium text-rose-600 hover:text-rose-700 transition"
                          onClick={() => remove(h)}
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
                <li key={h.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{h.name}</div>
                    <div className="text-xs text-slate-500 tabular-nums">{h.date}</div>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-medium text-rose-600 hover:text-rose-700 transition shrink-0"
                    onClick={() => remove(h)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
