"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DecisionButtons({ id, allowCancel = false }: { id: string; allowCancel?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(kind: "approve" | "reject" | "cancel") {
    let note: string | null = null;
    if (kind === "reject") {
      note = window.prompt("Reason for rejection (optional, shown to employee):") ?? "";
    } else if (kind === "cancel") {
      if (!window.confirm("Cancel this leave request? The employee will be notified.")) return;
    }
    setBusy(kind);
    const url = kind === "cancel" ? `/api/leave/${id}/cancel` : `/api/leave/${id}/decide`;
    const body = kind === "cancel" ? {} : { action: kind, note: note || null };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex gap-2 whitespace-nowrap">
      {!allowCancel ? (
        <>
          <button className="btn-success" disabled={!!busy} onClick={() => act("approve")}>
            {busy === "approve" ? "…" : "Approve"}
          </button>
          <button className="btn-danger" disabled={!!busy} onClick={() => act("reject")}>
            {busy === "reject" ? "…" : "Reject"}
          </button>
        </>
      ) : (
        <button className="btn-secondary" disabled={!!busy} onClick={() => act("cancel")}>
          {busy === "cancel" ? "…" : "Cancel"}
        </button>
      )}
    </div>
  );
}
