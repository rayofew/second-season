import { EASTSIDE } from './rules.ts';
import type { ContestSettings, Position, Scoring } from './rules.ts';
import type { StatLine } from './scoring.ts';

/**
 * Where a score came from, line by line.
 *
 * A total is unarguable and unexaminable. "22.51" for a defense is either right or badly wrong and
 * there is no way to tell which by looking at it — whereas "291 return yards → 11.6" is obviously
 * wrong the moment somebody who watches football reads it.
 *
 * This deliberately recomputes rather than instruments the scorer, because the scorer's shape is
 * the thing being checked: if the two ever disagree, one of them is lying about what the league
 * pays. A test asserts they agree on every real stat line in the suite.
 */

export interface Line {
  /** What was done. */
  label: string;
  /** The figures behind it, in the league's own terms. */
  detail: string;
  points: number;
}

const value = (line: StatLine, field: string): number => line[field] ?? 0;

const yards = (amount: number, each: number, whole: boolean): number =>
  whole ? Math.floor(amount / each) : amount / each;

function counted(
  line: StatLine,
  field: string,
  each: number,
  label: string,
  unit = '',
): Line | null {
  const count = value(line, field);
  if (!count || !each) return null;
  return {
    label,
    detail: `${round(count)}${unit} × ${each}`,
    points: count * each,
  };
}

/** Projections carry fractions of things that cannot be fractional; a detail line should not. */
const round = (amount: number): number => Math.round(amount * 100) / 100;

function yardage(
  line: StatLine,
  field: string,
  each: number,
  label: string,
  rules: Scoring,
): Line | null {
  const amount = value(line, field);
  if (!amount) return null;
  return {
    label,
    detail: `${round(amount)} yds ÷ ${each}`,
    points: yards(amount, each, rules.wholePoints),
  };
}

function offense(line: StatLine, rules: Scoring, rushLabel: string): Line[] {
  return [
    yardage(line, 'pass_yd', rules.passingYardsPerPoint, 'Passing yards', rules),
    counted(line, 'pass_td', rules.passingTouchdown, 'Passing touchdowns'),
    counted(line, 'pass_int', rules.interception, 'Interceptions thrown'),
    yardage(line, 'rush_yd', rules.rushingYardsPerPoint, rushLabel, rules),
    counted(line, 'rush_td', rules.rushingTouchdown, 'Rushing touchdowns'),
    counted(line, 'rec', rules.reception, 'Receptions'),
    yardage(line, 'rec_yd', rules.receivingYardsPerPoint, 'Receiving yards', rules),
    counted(line, 'rec_td', rules.receivingTouchdown, 'Receiving touchdowns'),
    counted(line, 'fum_lost', rules.fumbleLost, 'Fumbles lost'),
    counted(line, 'st_td', rules.returnTouchdown, 'Return touchdowns'),
    counted(line, 'pass_2pt', rules.twoPointConversion, 'Two point passes'),
    counted(line, 'rush_2pt', rules.twoPointConversion, 'Two point runs'),
    counted(line, 'rec_2pt', rules.twoPointConversion, 'Two point catches'),
  ].filter((entry): entry is Line => entry !== null);
}

function kicking(line: StatLine, rules: Scoring): Line[] {
  const fifties = value(line, 'fgm_50_59');
  const longs = line.fgm_60p ?? Math.max(0, value(line, 'fgm_50p') - fifties);
  const made = value(line, 'fgm');
  const lines: Line[] = [
    counted(line, 'fgm_0_19', rules.fieldGoalUnder40, 'Field goals under 20'),
    counted(line, 'fgm_20_29', rules.fieldGoalUnder40, 'Field goals 20 to 29'),
    counted(line, 'fgm_30_39', rules.fieldGoalUnder40, 'Field goals 30 to 39'),
    counted(line, 'fgm_40_49', rules.fieldGoal40To49, 'Field goals 40 to 49'),
    fifties ? { label: 'Field goals 50 to 59', detail: `${round(fifties)} × ${rules.fieldGoal50To59}`, points: fifties * rules.fieldGoal50To59 } : null,
    longs ? { label: 'Field goals 60 or more', detail: `${round(longs)} × ${rules.fieldGoal60Plus}`, points: longs * rules.fieldGoal60Plus } : null,
    counted(line, 'xpm', rules.extraPoint, 'Extra points'),
  ].filter((entry): entry is Line => entry !== null);

  if (made >= rules.fieldGoalBonus.atLeast && rules.fieldGoalBonus.points) {
    lines.push({
      label: `Bonus for ${rules.fieldGoalBonus.atLeast} field goals`,
      detail: `${round(made)} made`,
      points: rules.fieldGoalBonus.points,
    });
  }
  return lines;
}

function defense(line: StatLine, rules: Scoring): Line[] {
  const lines: Line[] = [
    counted(line, 'sack', rules.sack, 'Sacks'),
    counted(line, 'int', rules.defensiveInterception, 'Interceptions'),
    counted(line, 'fum_rec', rules.fumbleRecovery, 'Fumbles recovered'),
    counted(line, 'safe', rules.safety, 'Safeties'),
    counted(line, 'blk_kick', rules.blockedKick, 'Blocked kicks'),
    counted(line, 'def_td', rules.defensiveTouchdown, 'Defensive touchdowns'),
    counted(line, 'def_st_td', rules.defensiveTouchdown, 'Special teams touchdowns'),
  ].filter((entry): entry is Line => entry !== null);

  // The same all-or-nothing choice the scorer makes; see returnYards there for why.
  const weekly = line.kr_yd !== undefined || line.pr_yd !== undefined;
  const returned = weekly
    ? value(line, 'kr_yd') + value(line, 'pr_yd')
    : value(line, 'def_kr_yd') + value(line, 'def_pr_yd');
  if (returned && rules.returnYardsPerPoint) {
    lines.push({
      label: 'Return yards',
      detail: `${round(returned)} yds ÷ ${rules.returnYardsPerPoint}`,
      points: yards(returned, rules.returnYardsPerPoint, rules.wholePoints),
    });
  }

  const allowed = line.pts_allow;
  if (allowed !== undefined) {
    const tier = rules.pointsAllowed.find((entry) => allowed <= entry.upTo);
    lines.push({
      label: 'Points allowed',
      detail: tier
        ? `${round(allowed)} conceded, ${tier.upTo === 0 ? 'a shutout' : `${tier.upTo} or fewer`}`
        : `${round(allowed)} conceded, above every tier`,
      points: tier?.points ?? 0,
    });
  }
  return lines;
}

/** Every scoring line behind one player's figure, biggest contribution first. */
export function breakdown(
  position: Position,
  line: StatLine | undefined,
  settings: ContestSettings = EASTSIDE,
): Line[] {
  if (!line) return [];
  const rules = settings.scoring;
  const lines =
    position === 'DEF' ? defense(line, rules)
    : position === 'K' ? [...kicking(line, rules), ...offense(line, rules, 'Rushing yards')]
    : offense(line, rules, 'Rushing yards');

  return lines
    .filter((entry) => entry.points !== 0)
    .sort((first, second) => Math.abs(second.points) - Math.abs(first.points));
}

export const breakdownTotal = (lines: readonly Line[]): number =>
  lines.reduce((sum, entry) => sum + entry.points, 0);
