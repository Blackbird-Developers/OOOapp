import type { TypeOverview } from "@/lib/leave-rules";
import { annualParts } from "@/components/BalanceCards";

/**
 * Every leave type on someone's policy, and where they stand with each this
 * year. A statement, not a dashboard: one row per type, the rule on the
 * left, the numbers on the right.
 *
 * Yearly allowances count down ("16 of 21 left"). Types capped per occasion,
 * like paternity leave, have no yearly total to count down, so they show the
 * cap and what's been taken this year instead.
 */
export default function LeaveOverview({
  entries,
  year,
  who = "you",
}: {
  entries: TypeOverview[];
  year: number;
  /** Whose leave this is, for the wording. */
  who?: "you" | "they";
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-500">No leave types are switched on for {who === "you" ? "your" : "their"} policy.</p>;
  }
  return (
    <ul className="divide-y divide-neutral-100">
      {entries.map((entry) => {
        const detail = typeDetail(entry, who);
        return (
          <li key={entry.type} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900">
                {entry.name}
                {entry.retired && (
                  <span className="ml-2 text-xs font-normal text-neutral-500">
                    No longer on {who === "you" ? "your" : "their"} policy
                  </span>
                )}
              </p>
              {detail && <p className="mt-0.5 max-w-prose text-xs text-neutral-500">{detail}</p>}
            </div>
            <div className="shrink-0 tabular-nums sm:text-right">
              <p className="text-sm text-neutral-700">
                <Headline entry={entry} />
              </p>
              <p className="text-xs text-neutral-500">{takenLine(entry, year)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const days = (n: number, unit = "day") => `${n} ${unit}${n === 1 ? "" : "s"}`;

function Headline({ entry }: { entry: TypeOverview }) {
  if (entry.balance) {
    const { remaining, allowance } = entry.balance;
    return (
      <>
        <strong className={`font-semibold ${remaining < 0 ? "text-rose-600" : "text-neutral-900"}`}>{remaining}</strong>{" "}
        of {allowance} left
      </>
    );
  }
  if (entry.limit === "per_request") {
    const unit = entry.unit === "calendar" ? "calendar day" : "working day";
    return (
      <>
        Up to <strong className="font-semibold text-neutral-900">{days(Number(entry.days ?? 0), unit)}</strong> per occasion
      </>
    );
  }
  return <>No fixed limit</>;
}

/** What's been taken of it this year. */
function takenLine(entry: TypeOverview, year: number) {
  const parts: string[] = [];
  if (entry.balance) {
    if (entry.used > 0) parts.push(`${entry.used} used`);
    if (entry.pending > 0) parts.push(`${entry.pending} pending`);
    return parts.length ? parts.join(", ") : `None used in ${year}`;
  }
  if (entry.used > 0) parts.push(`${days(entry.used)} taken`);
  if (entry.pending > 0) parts.push(`${days(entry.pending)} pending`);
  if (!parts.length) return `None taken in ${year}`;
  const times = entry.requests > 1 ? ` · ${entry.requests} requests` : "";
  return `${parts.join(", ")} in ${year}${times}`;
}

/** The quieter line under the name: where annual days came from, or the policy's note. */
export function typeDetail(entry: TypeOverview, who: "you" | "they"): string | null {
  if (entry.type === "annual" && entry.balance?.annual) {
    const parts = annualParts(entry.balance.annual, who);
    if (parts) return `${parts.charAt(0).toUpperCase()}${parts.slice(1)}.`;
  }
  return entry.note;
}
