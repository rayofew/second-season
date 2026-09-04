import { EASTSIDE } from './rules.ts';
import type { Position, Scoring } from './rules.ts';

/**
 * Raw fantasy points from one player's stat line for one round.
 *
 * Deliberately knows nothing about multipliers, rosters or rounds. The whole game is built on the
 * promise that raw points are settled before anything is multiplied — keeping that promise is
 * easier if this file has no way to break it.
 *
 * The stat line is Sleeper's, which omits any field a player did not record. So every read goes
 * through `stat`, and a missing field means zero rather than a crash.
 */

/** A Sleeper stat line: field name to value, with everything the player did not do left out. */
export type StatLine = Readonly<Record<string, number>>;

const stat = (line: StatLine, field: string): number => line[field] ?? 0;

/**
 * Anything anyone can do with the ball, applied to every position.
 *
 * Kickers are included on purpose: a fake field goal is rare, but when it happens the yards are
 * real, and there is no cost to counting them.
 */
function offence(line: StatLine, rules: Scoring): number {
  return (
    stat(line, 'pass_yd') / rules.passingYardsPerPoint +
    stat(line, 'pass_td') * rules.passingTouchdown +
    stat(line, 'pass_int') * rules.interception +
    stat(line, 'rush_yd') / rules.rushingYardsPerPoint +
    stat(line, 'rush_td') * rules.rushingTouchdown +
    stat(line, 'rec') * rules.reception +
    stat(line, 'rec_yd') / rules.receivingYardsPerPoint +
    stat(line, 'rec_td') * rules.receivingTouchdown +
    stat(line, 'fum_lost') * rules.fumbleLost +
    (stat(line, 'pass_2pt') + stat(line, 'rush_2pt') + stat(line, 'rec_2pt')) * rules.twoPointConversion
  );
}

/**
 * Kicking, where the only difficulty is that Sleeper describes long field goals two ways.
 *
 * It always reports `fgm_50p` for everything from fifty out, and only sometimes breaks out
 * `fgm_60p`. Eastside pays 60+ at double the 50s, so the two have to be told apart: take the
 * explicit figure when it is there, and otherwise everything beyond the 50–59 bucket.
 */
function kicking(line: StatLine, rules: Scoring): number {
  const under40 = stat(line, 'fgm_0_19') + stat(line, 'fgm_20_29') + stat(line, 'fgm_30_39');
  const fiftyToFiftyNine = stat(line, 'fgm_50_59');
  const sixtyPlus = line.fgm_60p ?? Math.max(0, stat(line, 'fgm_50p') - fiftyToFiftyNine);

  // Paid once, however many he makes beyond the fifth.
  const bonus = stat(line, 'fgm') >= 5 ? rules.fiveFieldGoalBonus : 0;

  return (
    under40 * rules.fieldGoalUnder40 +
    stat(line, 'fgm_40_49') * rules.fieldGoal40To49 +
    fiftyToFiftyNine * rules.fieldGoal50To59 +
    sixtyPlus * rules.fieldGoal60Plus +
    stat(line, 'xpm') * rules.extraPoint +
    bonus
  );
}

/**
 * Defence and special teams.
 *
 * `pts_allow` is read rather than defaulted, because zero is a real and valuable answer here. A
 * missing field would otherwise be indistinguishable from a shutout, and would quietly hand ten
 * points to a defence that never took the field.
 */
function defence(line: StatLine, rules: Scoring): number {
  const allowed = line.pts_allow;
  const allowanceBonus =
    allowed === undefined ? 0
    : allowed === 0 ? rules.shutout
    : allowed <= 3 ? rules.oneToThreePointsAllowed
    : 0;

  return (
    stat(line, 'sack') * rules.sack +
    stat(line, 'int') * rules.defensiveInterception +
    stat(line, 'fum_rec') * rules.fumbleRecovery +
    stat(line, 'safe') * rules.safety +
    stat(line, 'blk_kick') * rules.blockedKick +
    (stat(line, 'def_td') + stat(line, 'def_st_td')) * rules.defensiveTouchdown +
    (stat(line, 'def_kr_yd') + stat(line, 'def_pr_yd')) / rules.returnYardsPerPoint +
    allowanceBonus
  );
}

/**
 * What a player scored, before any multiplier.
 *
 * Scoring is split by position rather than applied wholesale because several field names mean
 * different things depending on who recorded them — `int` is a quarterback's mistake and a
 * defence's takeaway. Today's data never mixes them, but nothing promises it will stay that way,
 * and the cost of being careful is one comparison.
 *
 * A player whose team did not play — eliminated, or resting during a bye — has no stat line at all,
 * and scores nothing. That is the whole implementation of both rules.
 */
export function rawPoints(position: Position, line: StatLine | undefined, rules: Scoring = EASTSIDE): number {
  if (!line) return 0;
  if (position === 'DEF') return defence(line, rules);
  return offence(line, rules) + (position === 'K' ? kicking(line, rules) : 0);
}

/** Points as they are shown. Kept apart from the figure that is stored, which never loses precision. */
export const display = (points: number): number => Math.round(points * 100) / 100;
