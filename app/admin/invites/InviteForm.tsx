"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InviteForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"employee" | "admin">("employee");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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
    setMessage({ kind: "ok", text: `Invite sent to ${email}.` });
    setFullName("");
    setEmail("");
    setRole("employee");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="label">Full name</label>
          <input className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as "employee" | "admin")}>
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? "Sending…" : "Send invite"}</button>
      {message && (
        <p className={`text-sm ${message.kind === "ok" ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>
      )}
    </form>
  );
}
