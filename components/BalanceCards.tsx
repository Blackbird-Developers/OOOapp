import type { Balance } from "@/lib/balances";

export default function BalanceCards({ balance }: { balance: Balance }) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <BalanceCard
        title="Annual leave"
        allowance={balance.annual_allowance}
        used={balance.annual_used}
        pending={balance.annual_pending}
        remaining={balance.annual_remaining}
        accent="emerald"
      />
      <BalanceCard
        title="Sick leave"
        allowance={balance.sick_allowance}
        used={balance.sick_used}
        pending={balance.sick_pending}
        remaining={balance.sick_remaining}
        accent="rose"
      />
    </section>
  );
}

function BalanceCard({
  title, allowance, used, pending, remaining, accent,
}: {
  title: string;
  allowance: number;
  used: number;
  pending: number;
  remaining: number;
  accent: "emerald" | "rose";
}) {
  const negative = remaining < 0;
  const dot = accent === "emerald" ? "bg-emerald-500" : "bg-rose-500";
  const fill = accent === "emerald" ? "bg-emerald-500" : "bg-rose-500";
  // Bar represents what's still available. Full bar = full allowance untouched.
  const remaining_pct = allowance > 0 ? Math.min(100, Math.max(0, (remaining / allowance) * 100)) : 0;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          <h3 className="text-sm font-medium text-slate-700">{title}</h3>
        </div>
        <span className="text-[11px] uppercase tracking-wider font-medium text-slate-400">
          this year
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <span className={`text-3xl font-semibold tracking-tight ${negative ? "text-rose-600" : "text-slate-900"}`}>
          {remaining}
        </span>
        <span className="text-sm text-slate-500">/ {allowance} days left</span>
      </div>

      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full ${fill} transition-[width] duration-500 ease-out`}
          style={{ width: `${remaining_pct}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 text-xs text-slate-500">
        <div><span className="font-medium text-slate-700">{used}</span> used</div>
        <div><span className="font-medium text-slate-700">{pending}</span> pending</div>
        <div className="text-right"><span className="font-medium text-slate-700">{allowance}</span> total</div>
      </div>
    </div>
  );
}
