"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Field from "@/components/Field";

/** The company's name, as everyone in it sees it in the app and in emails. */
export default function CompanyNameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/organization", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg({ kind: "err", text: j.error || "Couldn't save. Try again." });
      return;
    }
    setMsg({ kind: "ok", text: "Saved." });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="card p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900 tracking-tight">Company</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Shown to everyone on your team, and in invites and join emails.
        </p>
      </div>

      <div className="max-w-md">
        <Field label="Company name">
          {(p) => (
            <input
              {...p}
              required
              maxLength={80}
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="organization"
            />
          )}
        </Field>
      </div>

      <button className="btn-primary w-full sm:w-auto" disabled={busy || !name.trim() || name.trim() === initialName}>
        {busy ? "Saving…" : "Save"}
      </button>

      {msg && (
        <p role="status" className={`text-sm ${msg.kind === "ok" ? "text-neutral-700" : "text-rose-700"}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
