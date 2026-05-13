export default function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    pending:   { bg: "bg-amber-50",   text: "text-amber-800",   dot: "bg-amber-500" },
    approved:  { bg: "bg-emerald-50", text: "text-emerald-800", dot: "bg-emerald-500" },
    rejected:  { bg: "bg-rose-50",    text: "text-rose-800",    dot: "bg-rose-500" },
    cancelled: { bg: "bg-slate-100",  text: "text-slate-600",   dot: "bg-slate-400" },
  };
  const s = map[status] ?? { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.bg} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}
