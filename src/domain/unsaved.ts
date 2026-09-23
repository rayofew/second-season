import type { HeldPlayer } from './multiplier.ts';

/**
 * Whether a lineup has been changed since it was last sent.
 *
 * Worth being exact about. "Different from what was loaded" is not the same as "different from
 * what was submitted" — somebody who swaps two men and swaps them back has changed nothing, and
 * being warned about leaving a page he has not altered teaches him to ignore the warning, which
 * is how a warning stops working.
 *
 * The slot matters as much as the man. Moving somebody from FLEX to RB2 is a change even though
 * the nine names are identical, because the multiplier and the scoring both follow the slot.
 */

const shape = (roster: readonly HeldPlayer[]): string =>
  [...roster]
    .map((held) => `${held.slot}:${held.playerId}`)
    .sort()
    .join('|');

export function changed(roster: readonly HeldPlayer[], baseline: readonly HeldPlayer[]): boolean {
  return shape(roster) !== shape(baseline);
}
