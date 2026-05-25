"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Dialog from "@/components/Dialog";

export default function AllowanceEditor({
  id, annual, sick,
}: { id: string; annual: number; sick: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(annual);
  const [s, setS] = useState(sick);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = a !== annual || s !== sick;

  function cancel() {
    setA(annual);
    setS(sick);
    setError(null);
    setOpen(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/employees/${id}/allowance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ annual_allowance: a, sick_allowance: s }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't update allowances. Try again.");
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
        className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-neutral-600 transition hover:text-neutral-900"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">
        Annual
        <input
          type="number" step="0.5" min="0" className="input w-20"
          value={a} onChange={(e) => setA(Number(e.target.value))}
        />
      </label>
      <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">
        Sick
        <input
          type="number" step="0.5" min="0" className="input w-20"
          value={s} onChange={(e) => setS(Number(e.target.value))}
        />
      </label>
      <button className="btn-primary px-4 text-xs" disabled={!dirty || busy} onClick={save}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={busy}
        className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-neutral-500 transition hover:text-neutral-900 disabled:text-neutral-500"
      >
        Cancel
      </button>
      {error && (
        <Dialog
          open={!!error}
          onClose={() => setError(null)}
          title="Couldn't save allowances"
          description={error}
          footer={
            <button type="button" className="btn-primary" onClick={() => setError(null)}>
              OK
            </button>
          }
        />
      )}
    </div>
  );
}
