"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Field from "@/components/Field";

const OPTIONS = [
  { value: 0, label: "No minimum — same-day requests allowed" },
  { value: 3, label: "3 days in advance" },
  { value: 7, label: "1 week in advance" },
  { value: 14, label: "2 weeks in advance" },
  { value: 21, label: "3 weeks in advance" },
  { value: 30, label: "1 month (30 days) in advance" },
];

export default function SettingsForm({ initialNoticeDays }: { initialNoticeDays: number }) {
  const router = useRouter();
  const [noticeDays, setNoticeDays] = useState(initialNoticeDays);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // The stored value may predate the preset list (e.g. set via API); make sure
  // the select can still show it.
  const options = OPTIONS.some((o) => o.value === noticeDays)
    ? OPTIONS
    : [...OPTIONS, { value: noticeDays, label: `${noticeDays} days in advance` }].sort(
        (a, b) => a.value - b.value
      );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ annual_min_notice_days: noticeDays }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg({ kind: "err", text: j.error || "Couldn't save. Try again." });
      return;
    }
    setMsg({ kind: "ok", text: "Saved. The rule applies to new requests immediately." });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="card p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900 tracking-tight">
          Annual leave notice period
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          How far in advance employees must request annual leave. Admins can always log leave
          (including backfills), and sick leave is never restricted.
        </p>
      </div>

      <div className="max-w-md">
        <Field label="Minimum notice">
          {(p) => (
            <select
              {...p}
              className="input"
              value={noticeDays}
              onChange={(e) => setNoticeDays(Number(e.target.value))}
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <button className="btn-primary w-full sm:w-auto" disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </button>

      {msg && (
        <p className={`text-sm ${msg.kind === "ok" ? "text-neutral-700" : "text-rose-700"}`}>
          {msg.kind === "ok" && (
            <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-brand-accent align-middle" />
          )}
          {msg.text}
        </p>
      )}
    </form>
  );
}
