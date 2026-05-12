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
      setError(j.error || "Failed");
      return;
    }
    setDate("");
    setName("");
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this holiday?")) return;
    const res = await fetch(`/api/holidays?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <form onSubmit={add} className="card p-6 space-y-4">
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
        <button className="btn-primary" disabled={busy}>{busy ? "Adding…" : "Add holiday"}</button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-3">Holidays this year and beyond</h2>
        {initialHolidays.length === 0 ? (
          <p className="text-sm text-slate-500">No holidays configured yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2">Date</th>
                <th>Name</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {initialHolidays.map((h) => (
                <tr key={h.id} className="border-b border-slate-100">
                  <td className="py-2 whitespace-nowrap">{h.date}</td>
                  <td>{h.name}</td>
                  <td className="text-right">
                    <button className="text-red-600 text-xs hover:underline" onClick={() => remove(h.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
