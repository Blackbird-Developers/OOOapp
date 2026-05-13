"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AllowanceEditor({
  id, annual, sick,
}: { id: string; annual: number; sick: number }) {
  const router = useRouter();
  const [a, setA] = useState(annual);
  const [s, setS] = useState(sick);
  const [busy, setBusy] = useState(false);
  const dirty = a !== annual || s !== sick;

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
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number" step="0.5" min="0" className="input w-20 py-1"
        value={a} onChange={(e) => setA(Number(e.target.value))}
      />
      <input
        type="number" step="0.5" min="0" className="input w-20 py-1"
        value={s} onChange={(e) => setS(Number(e.target.value))}
      />
      <button className="btn-primary py-1 px-3 text-xs" disabled={!dirty || busy} onClick={save}>
        {busy ? "…" : "Save"}
      </button>
    </div>
  );
}
