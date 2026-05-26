"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Field from "@/components/Field";

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export default function ProfileEditor({
  initialFullName,
  email,
}: {
  initialFullName: string;
  email: string;
}) {
  const router = useRouter();
  const initial = splitName(initialFullName);

  const [first, setFirst] = useState(initial.first);
  const [last, setLast] = useState(initial.last);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const originalFull = initialFullName.trim();
  const nextFull = `${first} ${last}`.replace(/\s+/g, " ").trim();
  const dirty = nextFull !== originalFull;
  const valid = first.trim().length > 0 && last.trim().length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || !valid) return;
    setSubmitting(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ first_name: first.trim(), last_name: last.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(json.error || "Couldn't save your name. Please try again.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="First name">
          {(p) => (
            <input
              {...p}
              className="input"
              value={first}
              onChange={(e) => {
                setFirst(e.target.value);
                setSaved(false);
              }}
              autoComplete="given-name"
              maxLength={60}
              required
            />
          )}
        </Field>
        <Field label="Last name">
          {(p) => (
            <input
              {...p}
              className="input"
              value={last}
              onChange={(e) => {
                setLast(e.target.value);
                setSaved(false);
              }}
              autoComplete="family-name"
              maxLength={60}
              required
            />
          )}
        </Field>
      </div>

      <Field label="Email" hint="Email is managed by your admin and can't be changed here.">
        {(p) => (
          <input
            {...p}
            className="input"
            value={email}
            disabled
            readOnly
          />
        )}
      </Field>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="submit"
          className="btn-accent w-full sm:w-auto"
          disabled={submitting || !dirty || !valid}
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {saved && !error && (
        <p className="text-sm text-neutral-700">
          <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-brand-accent align-middle" />
          Saved.
        </p>
      )}
    </form>
  );
}
