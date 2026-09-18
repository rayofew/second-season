/**
 * How long ago, in the words somebody would actually say.
 *
 * A commissioner looking at this wants to know whether a manager has been in since he texted them,
 * not the exact minute. "Yesterday" and "3 days ago" answer that; a timestamp makes him do
 * arithmetic. Past a fortnight the relative form stops meaning anything, so it gives the date.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (count: number, thing: string) => `${count} ${thing}${count === 1 ? '' : 's'} ago`;

export function sinceWords(then: Date | undefined | null, now: Date = new Date()): string {
  if (!then) return 'never';

  const gap = now.getTime() - then.getTime();
  // A clock a little ahead of ours is not the future, it is a clock a little ahead of ours.
  if (gap < MINUTE) return 'just now';
  if (gap < HOUR) return plural(Math.floor(gap / MINUTE), 'minute');

  /*
   * Whole days rather than blocks of twenty-four hours, and counted before the hours are, because
   * half past eleven last night is yesterday at half past two — not fifteen hours ago, which is
   * true and useless.
   */
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const days = then >= midnight ? 0 : Math.ceil((midnight.getTime() - then.getTime()) / DAY);
  if (days === 0) return plural(Math.floor(gap / HOUR), 'hour');
  if (days === 1) return 'yesterday';
  if (days < 14) return plural(days, 'day');

  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Whether somebody has ever opened it, which is the fact a commissioner is chasing. */
export const hasBeenIn = (then: Date | undefined | null): boolean => Boolean(then);
