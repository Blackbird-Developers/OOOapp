import type { ReactNode } from "react";

export default function EmptyState({
  title,
  description,
  action,
  tone = "info",
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  // "info" = first-use or no-results (dashed neutral border).
  // "positive" = "you're caught up" (solid neutral border, lime dot).
  tone?: "info" | "positive";
}) {
  const borderCls =
    tone === "positive"
      ? "border-neutral-200"
      : "border-dashed border-neutral-300";

  return (
    <div className={`rounded-xl border ${borderCls} bg-white px-6 py-12 text-center`}>
      {tone === "positive" && (
        <span
          aria-hidden
          className="mx-auto mb-3 block h-2 w-2 rounded-full bg-brand-accent"
        />
      )}
      <h3 className="text-base font-semibold tracking-tight text-neutral-900">{title}</h3>
      {description && (
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-neutral-500">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
