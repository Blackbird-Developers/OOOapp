import type { Balance } from "@/lib/balances";

export default function BalanceCards({ balance }: { balance: Balance }) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <BalanceCard
        title="Annual leave"
        allowance={balance.annual_allowance}
        used={balance.annual_used}
        pending={balance.annual_pending}
        remaining={balance.annual_remaining}
        tint="indigo"
      />
      <BalanceCard
        title="Sick leave"
        allowance={balance.sick_allowance}
        used={balance.sick_used}
        pending={balance.sick_pending}
        remaining={balance.sick_remaining}
        tint="rose"
      />
    </section>
  );
}

function BalanceCard({
  title, allowance, used, pending, remaining, tint,
}: {
  title: string;
  allowance: number;
  used: number;
  pending: number;
  remaining: number;
  tint: "indigo" | "rose";
}) {
  const ring = tint === "indigo" ? "ring-indigo-100 bg-indigo-50" : "ring-rose-100 bg-rose-50";
  const text = tint === "indigo" ? "text-indigo-700" : "text-rose-700";
  const negative = remaining < 0;
  return (
    <div className={`card p-6 ring-2 ${ring}`}>
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className={`text-3xl font-bold ${negative ? "text-red-600" : text}`}>{remaining}</span>
      </div>
      <p className="text-xs text-slate-500 mt-1">days remaining (this year)</p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div><div className="font-semibold text-slate-700">{allowance}</div><div className="text-slate-500">Allowance</div></div>
        <div><div className="font-semibold text-slate-700">{used}</div><div className="text-slate-500">Used</div></div>
        <div><div className="font-semibold text-slate-700">{pending}</div><div className="text-slate-500">Pending</div></div>
      </div>
    </div>
  );
}
