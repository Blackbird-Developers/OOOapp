import type { Balance } from "@/lib/balances";

/**
 * Inline leave summary, not a card.
 * Reads like a status bar: `● Annual: 14 of 20 · 6 used    ● Sick: 20 of 20`.
 * Component name kept (`BalanceCards`) so existing imports don't break.
 */
export default function BalanceCards({ balance }: { balance: Balance }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
      <BalanceLine
        label="Annual"
        remaining={balance.annual_remaining}
        allowance={balance.annual_allowance}
        used={balance.annual_used}
        pending={balance.annual_pending}
        tone="emerald"
      />
      <span aria-hidden className="hidden sm:inline h-4 w-px bg-slate-200" />
      <BalanceLine
        label="Sick"
        remaining={balance.sick_remaining}
        allowance={balance.sick_allowance}
        used={balance.sick_used}
        pending={balance.sick_pending}
        tone="rose"
      />
    </div>
  );
}

function BalanceLine({
  label, remaining, allowance, used, pending, tone,
}: {
  label: string;
  remaining: number;
  allowance: number;
  used: number;
  pending: number;
  tone: "emerald" | "rose";
}) {
  const dot = tone === "emerald" ? "bg-emerald-500" : "bg-rose-500";
  const numClass = remaining < 0 ? "text-rose-600" : "text-slate-900";
  const detail: string[] = [];
  if (used > 0) detail.push(`${used} used`);
  if (pending > 0) detail.push(`${pending} pending`);

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold tabular-nums ${numClass}`}>{remaining}</span>
      <span className="text-slate-400">of {allowance}</span>
      {detail.length > 0 && (
        <span className="text-slate-400 tabular-nums">
          ({detail.join(", ")})
        </span>
      )}
    </span>
  );
}
