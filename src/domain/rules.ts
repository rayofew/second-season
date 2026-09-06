/**
 * What the contest is and how it scores.
 *
 * Everything here is data rather than behavior, because all of it is a league setting: the
 * commissioner changes a value on the rules screen and every engine that reads it follows, with
 * nothing recompiled and no code aware that anything moved. Eastside FFL is only the default.
 *
 * The engines take settings as an argument rather than importing them, so a contest played under
 * unusual rules is not a special case — it is the same code given different numbers.
 */

export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';

/**
 * A roster slot, described by what may fill it rather than by a single position.
 *
 * Written this way so FLEX is not a special case, and so Superflex or WR/TE is a change to a list
 * rather than to the validator.
 */
export interface Slot {
  id: string;
  eligible: readonly Position[];
}

/** Nine slots, all of which score. There is no bench. */
export const EASTSIDE_SLOTS: readonly Slot[] = [
  { id: 'QB', eligible: ['QB'] },
  { id: 'RB1', eligible: ['RB'] },
  { id: 'RB2', eligible: ['RB'] },
  { id: 'WR1', eligible: ['WR'] },
  { id: 'WR2', eligible: ['WR'] },
  { id: 'TE', eligible: ['TE'] },
  { id: 'FLEX', eligible: ['RB', 'WR', 'TE'] },
  { id: 'K', eligible: ['K'] },
  { id: 'DEF', eligible: ['DEF'] },
];

/** The four scoring rounds. A player's multiplier can never exceed the number of them. */
export const ROUNDS = ['wildcard', 'divisional', 'conference', 'superbowl'] as const;
export type Round = (typeof ROUNDS)[number];
export const MAX_MULTIPLIER = ROUNDS.length;

/**
 * What a defense earns for holding an offense down, cheapest tier first.
 *
 * A list rather than named fields because leagues disagree about how many tiers there are far more
 * than they disagree about what they pay. Eastside stops after two; a league wanting the usual six
 * bands adds them here and nothing else changes.
 */
export interface PointsAllowedTier {
  /** The most a defense may concede and still earn this. */
  upTo: number;
  points: number;
}

/**
 * Field goals are scored by the distance bands Sleeper actually reports.
 *
 * Bands rather than a points-per-yard formula because the data arrives pre-bucketed — nobody tells
 * us a kick was 47 yards, only that it fell in the forties. Sleeper does separate 0-19, 20-29 and
 * 30-39, so a league wanting finer tiers under forty could have them; Eastside pays one rate.
 */
export interface Scoring {
  reception: number;
  passingYardsPerPoint: number;
  passingTouchdown: number;
  interception: number;
  rushingYardsPerPoint: number;
  receivingYardsPerPoint: number;
  rushingTouchdown: number;
  receivingTouchdown: number;
  twoPointConversion: number;
  fumbleLost: number;
  /** A kick or punt returned for a score, credited to the man who ran it back. */
  returnTouchdown: number;

  extraPoint: number;
  fieldGoalUnder40: number;
  fieldGoal40To49: number;
  fieldGoal50To59: number;
  fieldGoal60Plus: number;
  /** A bonus for a big day from the kicker, paid once however many follow. */
  fieldGoalBonus: { atLeast: number; points: number };

  sack: number;
  defensiveInterception: number;
  fumbleRecovery: number;
  safety: number;
  blockedKick: number;
  defensiveTouchdown: number;
  returnYardsPerPoint: number;
  pointsAllowed: readonly PointsAllowedTier[];
}

/**
 * How a dead heat is broken, tried in order until one of them separates the two.
 *
 * A list rather than fixed logic because leagues care about this far more than the length of it
 * suggests, and because a five manager playthrough of the 2024 postseason produced an exact tie —
 * two managers who drafted the same team finished on the same number. It will happen.
 *
 * 'prediction' compares a guess at the total points scored in the Super Bowl, collected before the
 * contest locks. An entry without one loses that step rather than winning it by default.
 */
export type Tiebreaker =
  | { kind: 'roundScore'; round: number }
  | { kind: 'rawPoints' }
  | { kind: 'prediction' }
  | { kind: 'commissioner' };

export const EASTSIDE_TIEBREAKERS: readonly Tiebreaker[] = [
  { kind: 'roundScore', round: 3 },
  { kind: 'roundScore', round: 2 },
  { kind: 'rawPoints' },
  { kind: 'prediction' },
  { kind: 'commissioner' },
];

/**
 * What a player on a resting team is worth during Wild Card weekend.
 *
 * 'keep-streak' is the original game: he scores nothing, but the round still counts towards his
 * multiplier, so he returns at 2x. 'start-fresh' makes rostering him pointless until the Divisional
 * round. Kept a setting because it is the one rule most likely to be argued about.
 */
export type ByeRule = 'keep-streak' | 'start-fresh';

export interface ContestSettings {
  scoring: Scoring;
  slots: readonly Slot[];
  byeRule: ByeRule;
  tiebreakers: readonly Tiebreaker[];
  /** How many decimals are shown. What is stored never loses precision. */
  displayDecimals: number;
}

/** Eastside FFL scoring, copied from the league's own settings, plus the two values it never named. */
export const EASTSIDE_SCORING: Scoring = {
  reception: 1,
  passingYardsPerPoint: 25,
  passingTouchdown: 6,
  interception: -2,
  rushingYardsPerPoint: 10,
  receivingYardsPerPoint: 10,
  rushingTouchdown: 6,
  receivingTouchdown: 6,
  twoPointConversion: 2,
  fumbleLost: -2,
  returnTouchdown: 6,

  extraPoint: 1,
  fieldGoalUnder40: 3,
  fieldGoal40To49: 4,
  fieldGoal50To59: 5,
  fieldGoal60Plus: 10,
  fieldGoalBonus: { atLeast: 5, points: 5 },

  sack: 2,
  defensiveInterception: 2,
  fumbleRecovery: 2,
  safety: 2,
  blockedKick: 2,
  defensiveTouchdown: 6,
  returnYardsPerPoint: 25,
  pointsAllowed: [
    { upTo: 0, points: 10 },
    { upTo: 3, points: 5 },
  ],
};

/** What a new contest starts as, and what the rules screen resets to. */
export const EASTSIDE: ContestSettings = {
  scoring: EASTSIDE_SCORING,
  slots: EASTSIDE_SLOTS,
  byeRule: 'keep-streak',
  tiebreakers: EASTSIDE_TIEBREAKERS,
  displayDecimals: 2,
};
