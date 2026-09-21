import { todayISOIn } from "@/lib/days";
import { getLeaveContext, getLeaveRows, type LeaveContext } from "@/lib/leave-policies";
import { yearBalances, type LeaveRow, type YearBalance } from "@/lib/leave-rules";

export type LeaveSummary = LeaveContext & {
  /** Today in the company's time zone, which is what "this year" means. */
  todayISO: string;
  year: number;
  /** Their approved and pending leave, which the request form re-checks against as dates change. */
  rows: LeaveRow[];
  /** This year's balance for every yearly leave type their template has on. */
  balances: YearBalance[];
};

/**
 * Someone's template, leave and this year's balances. Everything is computed
 * on the fly from `leave_requests`, so 1 January needs no job: the year simply
 * changes, and carry-over is worked out from last year's rows.
 */
export async function getLeaveSummary(userId: string): Promise<LeaveSummary> {
  const todayISO = todayISOIn();
  const year = Number(todayISO.slice(0, 4));
  const [context, rows] = await Promise.all([getLeaveContext(userId), getLeaveRows(userId)]);
  return {
    ...context,
    todayISO,
    year,
    rows,
    balances: yearBalances(context.policy, context.employment, rows, year, todayISO),
  };
}
