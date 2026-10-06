"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Dialog from "@/components/Dialog";

/** Make someone an admin, or take it away again. Confirms first either way. */
export default function RoleButton({
  id,
  name,
  role,
}: {
  id: string;
  name: string;
  role: "admin" | "employee";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = role === "admin" ? "employee" : "admin";

  async function onConfirm() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/employees/${id}/role`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Couldn't change the role. Try again.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-neutral-500 transition hover:text-neutral-900"
      >
        {next === "admin" ? "Make admin" : "Remove admin"}
      </button>

      <Dialog
        open={open}
        onClose={close}
        title={next === "admin" ? `Make ${name} an admin?` : `Remove ${name} as admin?`}
        description={
          next === "admin"
            ? "Admins approve leave, manage people and policies, and change every company setting."
            : "They keep their account and leave, but lose access to the admin pages."
        }
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={onConfirm} disabled={busy}>
              {busy ? "Saving…" : next === "admin" ? "Make admin" : "Remove admin"}
            </button>
          </>
        }
      >
        {error && (
          <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}
      </Dialog>
    </>
  );
}
