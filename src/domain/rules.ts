/**
 * What the contest is and how it scores.
 *
 * Everything here is data rather than behaviour, because all of it is meant to be a league setting
 * one day: the commissioner should be able to change a scoring value or a roster slot without anyone
 * touching the engine that reads them.
 */

export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';

/**
 * A roster slot, described by what may fill it rather than by a single position.
 *
 * Written this way so FLEX is not a special case in the code, and so Superflex or WR/TE later is a
 * change to this list rather than to the validator.
 */
export interface Slot {
  id: string;
  eligible: readonly Position[];
}

/** Nine slots, all of which score. There is no bench. */
export const SLOTS: readonly Slot[] = [
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
  extraPoint: number;
  fieldGoalUnder40: number;
  fieldGoal40To49: number;
  fieldGoal50To59: number;
  fieldGoal60Plus: number;
  fiveFieldGoalBonus: number;
  sack: number;
  defensiveInterception: number;
  fumbleRecovery: number;
  safety: number;
  blockedKick: number;
  defensiveTouchdown: number;
  returnYardsPerPoint: number;
  shutout: number;
  oneToThreePointsAllowed: number;
}

/**
 * Eastside FFL scoring, copied from the league's own settings so the postseason game feels like the
 * season it follows.
 *
 * Two values are ours rather than theirs: `fumbleLost` and `blockedKick`. Eastside's published
 * settings carry neither, so these are the conventional figures and want confirming before January.
 */
export const EASTSIDE: Scoring = {
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
  extraPoint: 1,
  fieldGoalUnder40: 3,
  fieldGoal40To49: 4,
  fieldGoal50To59: 5,
  fieldGoal60Plus: 10,
  fiveFieldGoalBonus: 5,
  sack: 2,
  defensiveInterception: 2,
  fumbleRecovery: 2,
  safety: 2,
  blockedKick: 2,
  defensiveTouchdown: 6,
  returnYardsPerPoint: 25,
  shutout: 10,
  oneToThreePointsAllowed: 5,
};
