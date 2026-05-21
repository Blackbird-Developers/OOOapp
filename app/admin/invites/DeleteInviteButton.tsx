"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteInviteButton({
  id,
  email,
  variant = "desktop",
}: {
  id: string;
  email: string;
  variant?: "desktop" | "mobile";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm(`Delete invite for ${email}?`)) return;
    setBusy(true);
    const res = await fetch(`/api/invites/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error || "Couldn't delete the invite.");
      return;
    }
    router.refresh();
  }

  const label = busy ? "Deleting…" : "Delete";

  if (variant === "mobile") {
    return (
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
