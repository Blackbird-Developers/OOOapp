"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Dialog from "@/components/Dialog";
import Field from "@/components/Field";

/**
 * A person's start date and previous work experience: what seniority and
 * first-year leave on their leave policy are worked out from.
 */
export default function EmploymentEditor({
  id,
  name,
  startDate,
  priorExperienceMonths,
}: {
  id: string;
  name: string;
  startDate: string | null;
  priorExperienceMonths: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(startDate ?? "");
  const [years, setYears] = useState(String(Math.floor(priorExperienceMonths / 12)));
  const [months, setMonths] = useState(String(priorExperienceMonths % 12));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStart(startDate ?? "");
    setYears(String(Math.floor(priorExperienceMonths / 12)));
    setMonths(String(priorExperienceMonths % 12));
    setError(null);
  }

  function close() {
    if (busy) return;
    reset();
    setOpen(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const y = Number(years || 0);
    const m = Number(months || 0);
    if (!Number.isInteger(y) || !Number.isInteger(m) || y < 0 || m < 0 || m > 11 || y > 60) {
      setError("Previous experience needs whole years (0 to 60) and months (0 to 11).");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/employees/${id}/employment`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ start_date: start || null, prior_experience_months: y * 12 + m }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't save. Try again.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-neutral-600 transition hover:text-neutral-900"
      >
        Edit
      </button>

      <Dialog
        open={open}
        onClose={close}
        title={`Employment details for ${name}`}
        description="Seniority and first-year leave on their leave policy are worked out from these. Without a start date, they simply get their policy's yearly days."
        footer={
          <>
            <button type="button" className="btn-secondary" disabled={busy} onClick={close}>
              Cancel
            </button>
            <button type="submit" form={`employment-${id}`} className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <form id={`employment-${id}`} onSubmit={save} className="space-y-4 text-left">
          <Field label="Start date" hint="Their first day at the company.">
            {(p) => (
              <input {...p} type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
            )}
          </Field>
          <div>
            <p className="text-sm text-neutral-700">Previous work experience</p>
            <p className="text-xs text-neutral-500 mb-2">From before the company. It counts towards seniority.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Years">
                {(p) => (
                  <input
                    {...p}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={60}
                    step={1}
                    className="input"
                    value={years}
                    onChange={(e) => setYears(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Months">
                {(p) => (
                  <input
                    {...p}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={11}
                    step={1}
                    className="input"
                    value={months}
                    onChange={(e) => setMonths(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </div>
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </div>
          )}
        </form>
      </Dialog>
    </>
  );
}
