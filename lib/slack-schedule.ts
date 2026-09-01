/**
 * When the digest can actually be delivered.
 *
 * Vercel Cron fires in UTC on a schedule fixed at deploy time, so the set of
 * local hours the digest can hit is decided by vercel.json — not by the admin
 * editing settings. This module is the one place that knows both halves, so
 * the "Posts at" dropdown can offer exactly the hours that will really fire
 * instead of all 24, most of which would silently do nothing.
 *
 * Pure: no database, no environment, no clock. Safe to import from a client
 * component, which is why the constants live here rather than in slack-settings.
 */

/**
 * The UTC hours vercel.json triggers /api/cron/slack-daily at.
 *
 * MUST mirror vercel.json — there is no way to read that file at runtime, so
 * the two are kept in step by hand and each points at the other.
 *
 * Two entries is the Vercel Hobby ceiling: that plan allows two cron jobs and
 * triggers each at most once a day. On Pro, set vercel.json to "0 * * * *" and
 * this to every hour; `servablePostHours` then returns all 24 and the dropdown
 * opens up with no other change anywhere.
 */
export const CRON_UTC_HOURS = [4, 5];

/**
 * How many hours, counting the target itself, the digest may still go out in.
 *
 * Gives the cron more than one chance at the target — useful when Vercel fires
 * late, or when a post fails and releases its claim — without letting a leave
 * request logged in the afternoon trigger an afternoon "out of office today".
 */
export const POST_WINDOW_HOURS = 3;

/**
 * Kosovo runs UTC+1 in winter (CET) and UTC+2 in summer (CEST).
 *
 * An hour is only offered if it works in *both*, so the digest can't quietly
 * stop for half the year when the clocks change.
 */
const UTC_OFFSETS = [1, 2];

/**
 * The post hours this deployment's cron schedule can genuinely serve.
 *
 * An hour qualifies when, at every offset, some scheduled run lands inside its
 * window. With the two Hobby slots that comes to a narrow early-morning band —
 * which is the honest answer, and better than a dropdown that accepts 14:00 and
 * then never posts again.
 */
export function servablePostHours(): number[] {
  const hours: number[] = [];

  for (let target = 0; target < 24; target++) {
    const firesAtEveryOffset = UTC_OFFSETS.every((offset) =>
      CRON_UTC_HOURS.some((utcHour) => {
        const local = (utcHour + offset) % 24;
        return local >= target && local <= target + POST_WINDOW_HOURS - 1;
      })
    );
    if (firesAtEveryOffset) hours.push(target);
  }

  return hours;
}
