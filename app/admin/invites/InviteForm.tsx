"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Field from "@/components/Field";

export default function InviteForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"employee" | "admin">("employee");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<
    | { kind: "ok" | "err"; text: string; inviteUrl?: string; emailError?: string | null }
    | null
  >(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ full_name: fullName, email, role }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage({ kind: "err", text: json.error || "Couldn't send the invite. Check the email and try again." });
      return;
    }
    const sentTo = email;
    setMessage({
      kind: "ok",
      text: json.emailError
        ? `Invite created for ${sentTo}, but the email didn't send. Copy the link below and share it manually.`
        : `Invite sent to ${sentTo}.`,
      inviteUrl: json.inviteUrl,
      emailError: json.emailError,
    });
    setFullName("");
    setEmail("");
    setRole("employee");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Full name">
          {(p) => (
            <input {...p} className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          )}
        </Field>
        <Field label="Email">
          {(p) => (
            <input {...p} type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
        </Field>
        <Field label="Role">
          {(p) => (
            <select {...p} className="input" value={role} onChange={(e) => setRole(e.target.value as "employee" | "admin")}>
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
          )}
        </Field>
      </div>
      <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? "Sending…" : "Send invite"}</button>
      {message && (
        <div className="space-y-2">
          <p className={`text-sm ${message.kind === "err" || message.emailError ? "text-rose-700" : "text-neutral-700"}`}>
            {message.kind === "ok" && !message.emailError && (
              <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-brand-accent align-middle" />
            )}
            {message.text}
          </p>
          {message.inviteUrl && (
            <div className="flex items-center gap-2">
              <input
                readOnly
                className="input flex-1 font-mono text-xs"
                value={message.inviteUrl}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Invite link"
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigator.clipboard.writeText(message.inviteUrl!)}
              >
                Copy
              </button>
            </div>
          )}
          {message.emailError && (
            <p className="text-xs text-neutral-500">Email error: {message.emailError}</p>
          )}
        </div>
      )}
    </form>
  );
}
