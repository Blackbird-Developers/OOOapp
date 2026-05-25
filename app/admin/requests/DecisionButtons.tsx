"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Dialog from "@/components/Dialog";
import Field from "@/components/Field";

type Mode = "reject" | "cancel" | null;

export default function DecisionButtons({ id, allowCancel = false }: { id: string; allowCancel?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | "cancel" | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  async function approve() {
    setBusy("approve");
    setError(null);
    const res = await fetch(`/api/leave/${id}/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't approve the request. Try again.");
      return;
    }
    router.refresh();
  }

  async function submitReject() {
    setBusy("reject");
    setError(null);
    const res = await fetch(`/api/leave/${id}/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reject", note: note.trim() || null }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't reject the request. Try again.");
      return;
    }
    setMode(null);
    setNote("");
    router.refresh();
  }

  async function submitCancel() {
    setBusy("cancel");
    setError(null);
    const res = await fetch(`/api/leave/${id}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't cancel the request. Try again.");
      return;
    }
    setMode(null);
    router.refresh();
  }

  function closeDialog() {
    if (busy) return;
    setMode(null);
    setError(null);
  }

  return (
    <>
      <div className="flex gap-2 whitespace-nowrap">
        {!allowCancel ? (
          <>
            <button className="btn-accent" disabled={!!busy} onClick={approve}>
              {busy === "approve" ? "Approving…" : "Approve"}
            </button>
            <button
              className="btn-danger"
              disabled={!!busy}
              onClick={() => {
                setNote("");
                setMode("reject");
              }}
            >
              Reject
            </button>
          </>
        ) : (
          <button className="btn-secondary" disabled={!!busy} onClick={() => setMode("cancel")}>
            Cancel
          </button>
        )}
      </div>

      <Dialog
        open={mode === "reject"}
        onClose={closeDialog}
        title="Reject this request?"
        description="The employee will be notified and can see your reason on their My requests page."
        initialFocusRef={noteRef}
        footer={
          <>
            <button type="button" className="btn-secondary" disabled={!!busy} onClick={closeDialog}>
              Keep pending
            </button>
            <button type="button" className="btn-danger" disabled={!!busy} onClick={submitReject}>
              {busy === "reject" ? "Rejecting…" : "Reject request"}
            </button>
          </>
        }
      >
        <Field label="Reason (optional, shown to employee)">
          {(p) => (
            <textarea
              {...p}
              ref={noteRef}
              className="input"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. We need cover for the launch that week. Try the following Monday?"
            />
          )}
        </Field>
        {error && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}
      </Dialog>

      <Dialog
        open={mode === "cancel"}
        onClose={closeDialog}
        title="Cancel this leave request?"
        description="The employee will be notified that their leave has been cancelled."
        footer={
          <>
            <button type="button" className="btn-secondary" disabled={!!busy} onClick={closeDialog}>
              Keep it
            </button>
            <button type="button" className="btn-danger" disabled={!!busy} onClick={submitCancel}>
              {busy === "cancel" ? "Cancelling…" : "Cancel request"}
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

      {error && mode === null && (
        <Dialog
          open={!!error}
          onClose={() => setError(null)}
          title="Couldn't update the request"
          description={error}
          footer={
            <button type="button" className="btn-primary" onClick={() => setError(null)}>
              OK
            </button>
          }
        />
      )}
    </>
  );
}
