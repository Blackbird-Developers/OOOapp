"use client";

import { useState } from "react";
import Dialog from "@/components/Dialog";
import { typeDetail } from "@/components/LeaveOverview";
import type { TypeOverview } from "@/lib/leave-rules";

/**
 * "All leave types": a button at the end of the balance line that opens every
 * type on the person's policy in a dialog. The line itself only has room for
 * the yearly allowances (annual, sick); this is where paternity, marriage and
 * the rest can be checked without leaving the page.
 */
export default function AllLeaveTypes({ entries, year }: { entries: TypeOverview[]; year: number }) {
  const [open, setOpen] = useState(false);
  const available = entries.filter((e) => !e.retired);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="-my-3 inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-neutral-600 underline-offset-2 transition hover:text-neutral-900 hover:underline"
      >
        All leave types
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="3.5,2 6.5,5 3.5,8" />
        </svg>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Your leave in ${year}`}
        description="Each type has its own days, so taking one never uses up another."
        focusTitle
        footer={
          <button type="button" className="btn-primary" onClick={() => setOpen(false)}>
            Done
          </button>
        }
      >
        <ul className="-mt-1 divide-y divide-neutral-100">
          {available.map((entry) => {
            // What the type is for ("5 paid days for your wedding") is what
            // makes a cap per occasion make sense, so it reads under the name
            // at full width: the dialog is too narrow for a notes column.
            const detail = typeDetail(entry, "you");
            const taken = takenThisYear(entry);
            return (
              <li key={entry.type} className="py-3">
                {/* Side by side from sm; stacked on phones, where two wrapping columns read badly. */}
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <span className="text-sm font-medium text-neutral-900">{entry.name}</span>
                  <span className="text-sm tabular-nums text-neutral-700 sm:text-right">
                    <Availability entry={entry} />
                  </span>
                </div>
                {(detail || taken) && (
                  <div className="mt-1 space-y-0.5 text-xs text-neutral-500">
                    {detail && <p>{detail}</p>}
                    {taken && <p className="tabular-nums">{taken}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Dialog>
    </>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Days left of a yearly allowance, or the rule for anything else. */
function Availability({ entry }: { entry: TypeOverview }) {
  if (entry.balance) {
    const { remaining, allowance } = entry.balance;
    return (
      <>
        <strong className={`font-semibold ${remaining < 0 ? "text-rose-600" : "text-neutral-900"}`}>{remaining}</strong>{" "}
        of {plural(allowance, "day")} left
      </>
    );
  }
  if (entry.limit === "per_request") {
    // Not a yearly allowance: the days come again with each wedding, birth or
    // donation. Working days are the default everywhere; only calendar days
    // need saying.
    return (
      <>
        Up to <strong className="font-semibold text-neutral-900">{Number(entry.days ?? 0)}</strong>{" "}
        {entry.unit === "calendar" ? "calendar " : ""}
        {Number(entry.days) === 1 ? "day" : "days"} per occasion
      </>
    );
  }
  return <>No fixed limit</>;
}

/**
 * What's already been taken or booked this year, when there is something:
 * "5 used, 2 pending" under a yearly allowance, whose headline already
 * counts days; "5 days taken" under anything else, whose headline doesn't.
 */
function takenThisYear(entry: TypeOverview): string | null {
  const parts: [number, string][] = [];
  if (entry.used > 0) parts.push([entry.used, entry.balance ? "used" : "taken"]);
  if (entry.pending > 0) parts.push([entry.pending, "pending"]);
  if (!parts.length) return null;
  const text = parts
    .map(([n, word], i) => (i === 0 && !entry.balance ? `${plural(n, "day")} ${word}` : `${n} ${word}`))
    .join(", ");
  return `${text} this year`;
}
