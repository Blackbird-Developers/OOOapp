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
  const [overlay, setOverlay] = useState(false);
  const [banner, setBanner] = useState(false);
  const [items, setItems] = useState<ApprovedItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `bbm-seen-approvals-${userId}`;
    const raw = localStorage.getItem(key);
    const currentIds = approved.map((r) => r.id);

    if (raw === null) {
      // First time we've seen this user's browser — seed silently so we
      // don't celebrate historical approvals on initial sign-in.
      localStorage.setItem(key, JSON.stringify(currentIds));
      return;
    }

    const seen: string[] = JSON.parse(raw);
    const unseen = approved.filter((r) => !seen.includes(r.id));
    if (unseen.length === 0) return;

    setItems(unseen);
    setOverlay(true);
    setBanner(true);

    // Persist everything we know about as seen, including the new ones.
    localStorage.setItem(key, JSON.stringify(Array.from(new Set([...seen, ...currentIds]))));

    const clickTimer = setTimeout(playClick, 650);
    const overlayTimer = setTimeout(() => setOverlay(false), 3500);
    return () => {
      clearTimeout(clickTimer);
      clearTimeout(overlayTimer);
    };
  }, [userId, approved]);

  return (
    <>
      {banner && (
        <div
          className="celebrate-banner fixed top-[68px] left-1/2 z-40 flex items-center gap-3 rounded-full border border-emerald-200 bg-emerald-50 px-4 sm:px-5 py-2 text-xs sm:text-sm font-medium text-emerald-800 shadow-md max-w-[calc(100vw-1.5rem)]"
          style={{ transform: "translateX(-50%)" }}
        >
          <span className="text-emerald-600 shrink-0">✓</span>
          <span className="truncate">
            Your days off have been approved
            {items.length > 1 ? ` (${items.length} requests)` : items[0] ? ` — ${items[0].start_date}${items[0].start_date !== items[0].end_date ? ` → ${items[0].end_date}` : ""}` : ""}
          </span>
          <button
            type="button"
            onClick={() => setBanner(false)}
            className="ml-1 text-emerald-700 hover:text-emerald-900 shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {overlay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 cursor-pointer"
          onClick={() => setOverlay(false)}
        >
          <div className="text-center select-none px-6">
            <div className="relative inline-block">
              <span className="celebrate-ring absolute inset-0 rounded-full bg-emerald-400/50" />
              <div className="celebrate-pop relative">
                <svg className="w-32 h-32 sm:w-44 sm:h-44" viewBox="0 0 100 100" aria-hidden>
                  <circle cx="50" cy="50" r="45" fill="#10b981" />
                  <path
                    d="M28 52 L44 68 L72 36"
                    stroke="white"
                    strokeWidth="8"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
            <div className="celebrate-fade mt-6 sm:mt-8 text-white text-xl sm:text-2xl font-semibold drop-shadow-lg">
              Your days off have been approved!
            </div>
            <div className="celebrate-fade mt-4 sm:mt-6 text-white/60 text-xs">Tap anywhere to dismiss</div>
          </div>
        </div>
      )}
    </>
  );
}

function playClick() {
  try {
    const Ctx: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
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
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Browser autoplay policy may block — ignore.
  }
}
