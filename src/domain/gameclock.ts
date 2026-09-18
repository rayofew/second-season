import type { ClubState } from './live.ts';

/**
 * Where a game has got to, in the words a television caption would use.
 *
 * ESPN gives this three different ways and none of them is reliable on its own. The period and the
 * clock are separate fields, `shortDetail` is sometimes "Q2 1:03" and sometimes "2nd Quarter", and
 * the only thing that is always right is the status name. So the name decides, and the period and
 * clock are only assembled where the name says a game is genuinely running.
 *
 * That matters most at half time, where the period is 2 and the clock is 0:00 — assembling those
 * gives "Q2 0:00", which reads as a game that has stopped rather than one at the interval.
 */

export interface Status {
  state: ClubState;
  /** ESPN's `status.type.name`, which is the only field that is right on every game. */
  name?: string;
  period?: number;
  displayClock?: string;
  shortDetail?: string;
}

const ORDINAL: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };

/** Q1 to Q4, then OT, 2OT, 3OT — the way overtime is actually written. */
const periodName = (period: number): string =>
  period <= 4 ? `Q${period}` : period === 5 ? 'OT' : `${period - 4}OT`;

export function caption(status: Status): string {
  const { name = '', period = 0, displayClock = '' } = status;

  switch (name) {
    case 'STATUS_HALFTIME':
      return 'Half';
    case 'STATUS_END_PERIOD':
      // Between quarters. The clock reads 0:00 and the period has not ticked over yet.
      return period && ORDINAL[period] ? `End ${ORDINAL[period]}` : 'End of quarter';
    case 'STATUS_FINAL':
      return 'Final';
    case 'STATUS_FINAL_OVERTIME':
      return 'Final/OT';
    // Nobody is going to score in any of these, and a manager looking at a blank chip deserves to
    // know why rather than waiting all afternoon for a game that is not going to be played.
    case 'STATUS_DELAYED':
    case 'STATUS_RAIN_DELAY':
      return 'Delayed';
    case 'STATUS_POSTPONED':
      return 'Postponed';
    case 'STATUS_CANCELED':
      return 'Canceled';
    case 'STATUS_SUSPENDED':
      return 'Suspended';
    case 'STATUS_SCHEDULED':
      return '';
    case 'STATUS_IN_PROGRESS':
    case 'STATUS_FIRST_HALF':
    case 'STATUS_SECOND_HALF':
    case 'STATUS_OVERTIME':
      return running(period, displayClock);
  }

  // An unfamiliar status. Fall back to the state, which has only three values and cannot surprise.
  if (status.state === 'playing') {
    const where = period ? periodName(period) : '';
    return [where, displayClock].filter(Boolean).join(' ') || (status.shortDetail ?? '');
  }
  if (status.state === 'final') return status.shortDetail ?? 'Final';
  return '';
}

/**
 * The live caption for a game that is running: Q2 1:03.
 *
 * Kept apart from the named statuses above because this is the only one that changes between
 * one look at the screen and the next.
 */
export function running(period: number, displayClock: string): string {
  return [period ? periodName(period) : '', displayClock].filter(Boolean).join(' ');
}
