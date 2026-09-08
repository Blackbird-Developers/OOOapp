"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Dialog from "@/components/Dialog";

export default function CancelRequestButton({
  id,
  startDate,
  endDate,
  days,
}: {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/leave/${id}/cancel`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Couldn't cancel the request. Try again.");
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
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        disabled={busy}
        className="inline-flex min-h-11 items-center px-2 -mr-2 text-xs font-medium text-rose-600 transition hover:text-rose-700 disabled:text-rose-300"
      >
        Cancel
      </button>

      <Dialog
        open={open}
        onClose={close}
        title="Cancel this request?"
        description={
          <>
            Your request for{" "}
            <span className="font-medium text-neutral-900">
              {startDate === endDate ? startDate : `${startDate} → ${endDate}`}
            </span>{" "}
            ({days} {days === 1 ? "day" : "days"}) will be withdrawn and the{" "}
            {days === 1 ? "day goes" : "days go"} back into your balance. Your admin will be told
            it no longer needs a decision.
          </>
        }
        footer={
          <>
            <button type="button" className="btn-secondary" disabled={busy} onClick={close}>
              Keep it
            </button>
            <button type="button" className="btn-danger" disabled={busy} onClick={onConfirm}>
              {busy ? "Cancelling…" : "Cancel request"}
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
