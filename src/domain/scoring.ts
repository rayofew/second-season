import { EASTSIDE } from './rules.ts';
import type { ContestSettings, Position, Scoring } from './rules.ts';

/**
 * Raw fantasy points from one player's stat line for one round.
 *
 * Deliberately knows nothing about multipliers, rosters or rounds. The whole game is built on the
 * promise that raw points are settled before anything is multiplied — keeping that promise is
 * easier if this file has no way to break it.
 *
 * Every value it applies arrives in the settings it is handed, so a commissioner changing a rule
 * changes the result here without a line of this file knowing.
 *
 * The stat line is Sleeper's, which omits any field a player did not record. So every read goes
 * through `stat`, and a missing field means zero rather than a crash.
 */

/** A Sleeper stat line: field name to value, with everything the player did not do left out. */
export type StatLine = Readonly<Record<string, number>>;

const stat = (line: StatLine, field: string): number => line[field] ?? 0;

/**
 * Points for yards, which are earned a whole one at a time.
 *
 * Seventy-eight receiving yards is seven points and seventy-nine is still seven. The eightieth
 * earns the eighth. Nothing is rounded at the end because no fraction is ever created.
 */
const perYard = (yards: number, each: number): number => Math.floor(yards / each);

/**
 * Anything anyone can do with the ball, applied to every position.
 *
 * Kickers are included on purpose: a fake field goal is rare, but when it happens the yards are
 * real, and there is no cost to counting them.
 */
function offense(line: StatLine, rules: Scoring): number {
  return (
    perYard(stat(line, 'pass_yd'), rules.passingYardsPerPoint) +
    stat(line, 'pass_td') * rules.passingTouchdown +
    stat(line, 'pass_int') * rules.interception +
    perYard(stat(line, 'rush_yd'), rules.rushingYardsPerPoint) +
    stat(line, 'rush_td') * rules.rushingTouchdown +
    stat(line, 'rec') * rules.reception +
    perYard(stat(line, 'rec_yd'), rules.receivingYardsPerPoint) +
    stat(line, 'rec_td') * rules.receivingTouchdown +
    stat(line, 'fum_lost') * rules.fumbleLost +
    // Only ever reached by an outfield player: a defense's return scores are counted with the rest
    // of its work below, so nobody is paid twice for the same touchdown.
    stat(line, 'st_td') * rules.returnTouchdown +
    (stat(line, 'pass_2pt') + stat(line, 'rush_2pt') + stat(line, 'rec_2pt')) * rules.twoPointConversion
  );
}

/**
 * Kicking, where the only difficulty is that Sleeper describes long field goals two ways.
 *
 * It always reports `fgm_50p` for everything from fifty out, and only sometimes breaks out
 * `fgm_60p`. Eastside pays 60+ at double the 50s, so the two have to be told apart: take the
 * explicit figure when it is there, and otherwise everything beyond the 50-59 bucket.
 */
function kicking(line: StatLine, rules: Scoring): number {
  const under40 = stat(line, 'fgm_0_19') + stat(line, 'fgm_20_29') + stat(line, 'fgm_30_39');
  const fiftyToFiftyNine = stat(line, 'fgm_50_59');
  const sixtyPlus = line.fgm_60p ?? Math.max(0, stat(line, 'fgm_50p') - fiftyToFiftyNine);

  // Paid once, however many he makes beyond the threshold.
  const bonus = stat(line, 'fgm') >= rules.fieldGoalBonus.atLeast ? rules.fieldGoalBonus.points : 0;

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
 * Defense and special teams.
 *
 * `pts_allow` is read rather than defaulted, because zero is a real and valuable answer here. A
 * missing field would otherwise be indistinguishable from a shutout, and would quietly hand ten
 * points to a defense that never took the field.
 *
 * Tiers are searched in order and the first that fits wins, so they must be listed cheapest first —
 * which is also the only order anyone would write them in.
 */
function defense(line: StatLine, rules: Scoring): number {
  const allowed = line.pts_allow;
  const allowanceBonus =
    allowed === undefined ? 0 : (rules.pointsAllowed.find((tier) => allowed <= tier.upTo)?.points ?? 0);

  return (
    stat(line, 'sack') * rules.sack +
    stat(line, 'int') * rules.defensiveInterception +
    stat(line, 'fum_rec') * rules.fumbleRecovery +
    stat(line, 'safe') * rules.safety +
    stat(line, 'blk_kick') * rules.blockedKick +
    (stat(line, 'def_td') + stat(line, 'def_st_td')) * rules.defensiveTouchdown +
    perYard(stat(line, 'def_kr_yd') + stat(line, 'def_pr_yd'), rules.returnYardsPerPoint) +
    allowanceBonus
  );
}

/**
 * What a player scored, before any multiplier.
 *
 * Scoring is split by position rather than applied wholesale because several field names mean
 * different things depending on who recorded them — `int` is a quarterback's mistake and a
 * defense's takeaway. Today's data never mixes them, but nothing promises it will stay that way,
 * and the cost of being careful is one comparison.
 *
 * A player whose team did not play — eliminated, or resting during a bye — has no stat line at all,
 * and scores nothing. That is the whole implementation of both rules.
 */
export function rawPoints(
  position: Position,
  line: StatLine | undefined,
  settings: ContestSettings = EASTSIDE,
): number {
  if (!line) return 0;
  const rules = settings.scoring;
  if (position === 'DEF') return defense(line, rules);
  return offense(line, rules) + (position === 'K' ? kicking(line, rules) : 0);
}

/**
 * What a man is expected to score, as a whole number.
 *
 * A projected stat line holds fractions of things that cannot be fractional: 1.57 passing
 * touchdowns is a sensible expectation and an impossible afternoon. Yards are already whole by
 * the time they get here; this rounds off what is left, because a real score in this league is
 * never fractional and a projection that looks unlike one invites the question of which is wrong.
 */
export function projectedPoints(
  position: Position,
  line: StatLine | undefined,
  settings: ContestSettings = EASTSIDE,
): number {
  return Math.round(rawPoints(position, line, settings));
}

/** Points as they are shown. Kept apart from the figure that is stored, which never loses precision. */
export function display(points: number, settings: ContestSettings = EASTSIDE): number {
  const factor = 10 ** settings.displayDecimals;
  return Math.round(points * factor) / factor;
}

/**
 * Points written out, the only way a figure should reach the screen.
 *
 * The decimals were a setting that nothing consulted: every screen called toFixed(1) itself, so
 * changing the contest changed nothing and a whole-number league displayed a decimal point it can
 * never fill. One formatter, asked once, is what makes the setting mean something.
 */
export function points(value: number, settings: ContestSettings = EASTSIDE): string {
  return display(value, settings).toFixed(settings.displayDecimals);
}
