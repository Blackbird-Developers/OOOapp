"use client";

import { useEffect, useState } from "react";

type ApprovedItem = {
  id: string;
  type: "annual" | "sick";
  start_date: string;
  end_date: string;
  days_count: number;
};

export default function ApprovalCelebration({
  userId,
  approved,
}: {
  userId: string;
  approved: ApprovedItem[];
}) {
  const [banner, setBanner] = useState(false);
  const [items, setItems] = useState<ApprovedItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `bbm-seen-approvals-${userId}`;
    const raw = localStorage.getItem(key);
    const currentIds = approved.map((r) => r.id);

    if (raw === null) {
      // First time we've seen this user's browser: seed silently so we
      // don't celebrate historical approvals on initial sign-in.
      localStorage.setItem(key, JSON.stringify(currentIds));
      return;
    }

    const seen: string[] = JSON.parse(raw);
    const unseen = approved.filter((r) => !seen.includes(r.id));
    if (unseen.length === 0) return;

    setItems(unseen);
    setBanner(true);

    localStorage.setItem(key, JSON.stringify(Array.from(new Set([...seen, ...currentIds]))));

    // Slight delay so the audio cue lands as the banner finishes sliding in.
    const clickTimer = setTimeout(playClick, 220);
    return () => clearTimeout(clickTimer);
  }, [userId, approved]);

  if (!banner) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="celebrate-banner fixed top-[68px] left-1/2 z-40 flex items-center gap-3 rounded-full bg-brand-accent px-4 sm:px-5 py-2 text-xs sm:text-sm font-bold text-brand-ink shadow-md ring-1 ring-brand-ink/5 max-w-[calc(100vw-1.5rem)]"
      style={{ transform: "translateX(-50%)" }}
    >
      <span aria-hidden className="shrink-0">✓</span>
      <span className="truncate">
        Leave approved
        {items.length > 1
          ? ` (${items.length} requests)`
          : items[0]
          ? items[0].start_date === items[0].end_date
            ? ` for ${items[0].start_date}`
            : ` for ${items[0].start_date} to ${items[0].end_date}`
          : ""}
      </span>
      <button
        type="button"
        onClick={() => setBanner(false)}
        className="-mr-1 ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-brand-ink/70 transition hover:bg-brand-ink/10 hover:text-brand-ink"
        aria-label="Dismiss notification"
      >
        <span aria-hidden>×</span>
      </button>
    </div>
  );
}

function playClick() {
  try {
    const Ctx: typeof AudioContext | undefined =
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
      window.AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.onended = () => {
      ctx.close().catch(() => {});
    };
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Browser autoplay policy may block; ignore.
  }
}
