import { Fragment, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import type { AnnualBreakdown, YearBalance } from "@/lib/leave-rules";

/**
 * Inline leave summary, not a card.
 * Reads like a status bar: `Annual 14 of 20 (6 used)    Sick 20 of 20`.
 * Component name kept (`BalanceCards`) so existing imports don't break.
 *
 * One entry per yearly leave type on the person's template. When the annual
 * figure isn't simply the template's number (seniority, a first year, days
 * carried over), a quiet line underneath says where it came from, so nobody
 * has to ask why they have 21 days.
 */
export default function BalanceCards({
  balances,
  align = "end",
  children,
}: {
  balances: YearBalance[];
  /** Which side the line hugs from `sm` up: the page header's right edge, or the left. */
  align?: "start" | "end";
  /** Ends the line, after a separator: the "All leave types" button. */
  children?: ReactNode;
}) {
  const annual = balances.find((b) => b.type === "annual")?.annual ?? null;
  const explanation = annual ? explainAnnual(annual) : null;

  return (
    <div className="space-y-1.5">
      <div className={`flex flex-wrap items-center gap-x-6 gap-y-3 text-sm ${align === "end" ? "sm:justify-end" : ""}`}>
        {balances.map((b, i) => (
          <Fragment key={b.type}>
            {i > 0 && <span aria-hidden className="hidden sm:inline h-4 w-px bg-neutral-200" />}
            <BalanceLine
              label={shortLabel(b.name)}
              remaining={b.remaining}
              allowance={b.allowance}
              used={b.used}
              pending={b.pending}
            />
          </Fragment>
        ))}
        {children && (
          <>
            {balances.length > 0 && <span aria-hidden className="hidden sm:inline h-4 w-px bg-neutral-200" />}
            {children}
          </>
        )}
      </div>
      {explanation && (
        <p className={`text-xs text-neutral-500 ${align === "end" ? "sm:text-right" : ""}`}>{explanation}</p>
      )}
    </div>
  );
}

/** "Annual leave" reads as "Annual" in a status bar. */
export function shortLabel(name: string): string {
  return name.replace(/\s+leave$/i, "") || name;
}

const dayMonth = (iso: string) => format(parseISO(iso), "d MMMM");
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** Where this year's annual days came from, or null when it's just the template's number. */
export function explainAnnual(a: AnnualBreakdown): string | null {
  const parts = annualParts(a);
  return parts ? `Annual: ${parts}.` : null;
}

/** The pieces of `explainAnnual`, without the "Annual:" lead-in, for lists that already name the type. */
export function annualParts(a: AnnualBreakdown, who: "you" | "they" = "you"): string | null {
  const parts: string[] = [];
  if (a.firstYear) {
    parts.push(
      `${days(a.own)} earned in ${who === "you" ? "your" : "their"} first year (${a.firstYear.perMonth} a month, up to ${a.base})`
    );
  } else if (a.seniorityDays > 0) {
    parts.push(`${a.base} + ${a.seniorityDays} for ${a.experienceYears} years' experience`);
  }
  if (a.carriedIn > 0) {
    const carried = `${days(a.carriedIn)} carried over from last year`;
    if (a.carriedExpired > 0 && a.carryExpires) {
      parts.push(`${carried}, ${days(a.carriedExpired)} of it expired on ${dayMonth(a.carryExpires)}`);
    } else if (a.carryExpires && a.carriedLeft > 0) {
      parts.push(`${carried}, use by ${dayMonth(a.carryExpires)}`);
    } else {
      parts.push(carried);
    }
  }
  return parts.length ? parts.join("; ") : null;
}

function BalanceLine({
  label, remaining, allowance, used, pending,
}: {
  label: string;
  remaining: number;
  allowance: number;
  used: number;
  pending: number;
}) {
  const numClass = remaining < 0 ? "text-rose-600" : "text-neutral-900";
  const detail: string[] = [];
  if (used > 0) detail.push(`${used} used`);
  if (pending > 0) detail.push(`${pending} pending`);

  return (
    <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">{label}</span>
      <span className={`font-semibold tabular-nums ${numClass}`}>{remaining}</span>
      <span className="text-neutral-500">of {allowance}</span>
      {detail.length > 0 && (
        <span className="text-neutral-500 tabular-nums">
          ({detail.join(", ")})
        </span>
      )}
    </span>
  );
}
