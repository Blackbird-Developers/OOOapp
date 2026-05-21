"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AllowanceEditor({
  id, annual, sick,
}: { id: string; annual: number; sick: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(annual);
  const [s, setS] = useState(sick);
  const [busy, setBusy] = useState(false);
  const dirty = a !== annual || s !== sick;

  function cancel() {
    setA(annual);
    setS(sick);
    setOpen(false);
  }

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/employees/${id}/allowance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ annual_allowance: a, sick_allowance: s }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Couldn't update allowances. Try again.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-slate-600 hover:text-slate-900"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1 text-[11px] text-slate-500">
        Annual
        <input
          type="number" step="0.5" min="0" className="input w-20 py-1"
          value={a} onChange={(e) => setA(Number(e.target.value))}
        />
      </label>
      <label className="flex items-center gap-1 text-[11px] text-slate-500">
        Sick
        <input
          type="number" step="0.5" min="0" className="input w-20 py-1"
          value={s} onChange={(e) => setS(Number(e.target.value))}
        />
      </label>
      <button className="btn-primary py-1 px-3 text-xs" disabled={!dirty || busy} onClick={save}>
        {busy ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={busy}
        className="text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}
