import { EASTSIDE, MAX_MULTIPLIER } from './rules.ts';
import type { ContestSettings, Position } from './rules.ts';

/**
 * How long a manager has held each player, and what that is worth.
 *
 * Almost every rule in the game turns out to be the same rule: count the rounds a player has been
 * held without interruption, and stop counting at the first round he was missing. A replacement
 * starts at one because he has only just arrived. A player dropped and picked up again starts at
 * one because the gap ends the old run. Moving a receiver into FLEX changes nothing because slots
 * are never consulted. An injured man, or one whose team is out, keeps his streak because he is
 * still on the roster. None of those needed code of their own.
 *
 * The single exception is a first-round bye under 'start-fresh', which is the only case where a
 * player was genuinely held and the round still must not count.
 */

/** One player as he sat on a roster for one round. */
export interface HeldPlayer {
  playerId: string;
  position: Position;
  /** Which slot he filled. Recorded for the audit trail; never read when counting a streak. */
  slot: string;
  /** True when his NFL team was resting that round. */
  onBye?: boolean;
}

/** A manager's roster for one round, and the history of them in playing order. */
export type RoundRoster = readonly HeldPlayer[];
export type RosterHistory = readonly RoundRoster[];

export interface Standing {
  playerId: string;
  position: Position;
  slot: string;
  /** Rounds held without interruption, counting this one. */
  streak: number;
  /** What his points are worth this round: the streak, capped, never below one. */
  multiplier: number;
  /** Held in the previous round too — the difference between a familiar face and a new signing. */
  retained: boolean;
  /** Index of the round the current run began, so a screen can say "held since Wild Card". */
  heldSince: number;
}

const heldIn = (roster: RoundRoster, playerId: string): HeldPlayer | undefined =>
  roster.find((held) => held.playerId === playerId);

/**
 * How many consecutive rounds ending at `round` this player has been held.
 *
 * Walks backwards and stops at the first round he is missing from. A bye under 'start-fresh' is
 * passed over rather than stopped at: he was held, so the run continues, but the round earns him
 * nothing towards it.
 */
function streakAt(
  history: RosterHistory,
  playerId: string,
  round: number,
  settings: ContestSettings,
): { streak: number; heldSince: number } {
  let streak = 0;
  let heldSince = round;

  for (let index = round; index >= 0; index -= 1) {
    const held = heldIn(history[index] ?? [], playerId);
    if (!held) break;
    heldSince = index;
    if (held.onBye && settings.byeRule === 'start-fresh') continue;
    streak += 1;
  }

  return { streak, heldSince };
}

/**
 * Every player's standing for one round.
 *
 * A rostered player is never shown below 1x, even in the one case where his streak is genuinely
 * zero — a bye under 'start-fresh'. He has no game that round and scores nothing either way, so
 * the choice is only about what the screen says, and "1x" is the honest answer to "what is he
 * worth if he plays".
 */
export function standingsFor(
  history: RosterHistory,
  round: number,
  settings: ContestSettings = EASTSIDE,
): Standing[] {
  const roster = history[round] ?? [];

  return roster.map((held) => {
    const { streak, heldSince } = streakAt(history, held.playerId, round, settings);
    return {
      playerId: held.playerId,
      position: held.position,
      slot: held.slot,
      streak,
      multiplier: Math.min(Math.max(streak, 1), MAX_MULTIPLIER),
      retained: round > 0 && heldIn(history[round - 1] ?? [], held.playerId) !== undefined,
      heldSince,
    };
  });
}

/** Every round's standings, in playing order. */
export function standings(history: RosterHistory, settings: ContestSettings = EASTSIDE): Standing[][] {
  return history.map((_, round) => standingsFor(history, round, settings));
}

/**
 * What a performance is actually worth.
 *
 * Trivial on purpose. It exists so that the one ordering the whole game depends on — raw points
 * settled first, multiplied second — is a thing you can point at rather than a convention.
 */
export const creditedPoints = (raw: number, multiplier: number): number => raw * multiplier;
