"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Dialog from "@/components/Dialog";

export default function DeleteInviteButton({
  id,
  email,
}: {
  id: string;
  email: string;
  // Variant kept for source compatibility with existing callsites; the visual
  // treatment is the same on desktop and mobile now (one shared button shape).
  variant?: "desktop" | "mobile";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/invites/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Couldn't delete the invite. Try again.");
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
        disabled={busy}
        className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-rose-600 transition hover:text-rose-700 disabled:text-rose-300"
      >
        Delete
      </button>

      <Dialog
        open={open}
        onClose={close}
        title="Delete this invite?"
        description={
          <>
            The invite link for{" "}
            <span className="font-medium text-neutral-900">{email}</span> will stop working immediately.
          </>
        }
        footer={
          <>
            <button type="button" className="btn-secondary" disabled={busy} onClick={close}>
              Keep it
            </button>
            <button type="button" className="btn-danger" disabled={busy} onClick={onConfirm}>
              {busy ? "Deleting…" : "Delete invite"}
            </button>
          </>
        }
      >
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}
      </Dialog>
    </>
  );
}
