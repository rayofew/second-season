/**
 * The prize pool, and how it splits.
 *
 * Nothing here moves money. It records what the buy-in is, who has paid and what each place would
 * get, which is the part that otherwise lives in a group chat and gets argued about in February.
 * Settling up stays between people.
 */
import { breakdown } from './payouts.ts';
import type { Plan } from './payouts.ts';

export interface Payout {
  place: number;
  share: number;
  amount: number;
}

export interface Prizes {
  buyIn: number;
  /** Null lets the size of the field decide. */
  places: number | null;
  /** Percentages, first place first. Null uses the default shape for that many places. */
  shares: number[] | null;
  /** Paid each round to the best raw score. Comes out of the pot before the places are worked out. */
  weekly: number;
  /**
   * The payout table by field size, from the calculator on Commish. When it is set it decides
   * everything above — places, shares and the weekly prize — and those fields are ignored.
   */
  plan?: Plan;
  /** When the commissioner locked the plan in. Until then Rules calls it a draft. */
  lockedAt?: Date;
}

export const NO_PRIZES: Prizes = { buyIn: 0, places: null, shares: null, weekly: 0 };

/**
 * How many places pay, for a field of this size.
 *
 * Paying three out of twenty leaves most of the room with nothing to play for by the third round.
 */
export function placesFor(managers: number): number {
  if (managers <= 6) return 2;
  if (managers <= 12) return 3;
  if (managers <= 18) return 4;
  return 5;
}

/**
 * The default shape, steep enough that winning is worth more than placing.
 *
 * Written out rather than derived from a curve: these are the shapes people actually use, and a
 * formula producing 37.4% would only invite argument.
 */
const SHARES: Record<number, number[]> = {
  1: [100],
  2: [65, 35],
  3: [50, 30, 20],
  4: [45, 27, 18, 10],
  5: [40, 25, 15, 12, 8],
};

export const defaultShares = (places: number): number[] =>
  SHARES[Math.min(Math.max(places, 1), 5)] ?? SHARES[3]!;

export interface Pot {
  /** Everything the field is worth if everybody pays. */
  total: number;
  /** Set aside for the weekly prizes. */
  weekly: number;
  /** What the places divide between them. */
  places: number;
  payouts: Payout[];
  /** What each weekly spot is worth every round, best raw score first. One entry for a single winner. */
  weeklySpots: number[];
}

export function pot(managers: number, prizes: Prizes, rounds: number): Pot {
  if (prizes.plan) {
    const paid = breakdown(managers, prizes.plan, rounds);
    return {
      total: paid.pot,
      weekly: paid.weeklyTotal,
      places: paid.placesPool,
      payouts: paid.places.map((amount, index) => ({ place: index + 1, share: paid.shares[index] ?? 0, amount })),
      weeklySpots: paid.weeklySpots,
    };
  }
  const total = managers * prizes.buyIn;
  // The weekly prizes come off the top: a pot that pays them out of nowhere does not add up.
  const weekly = Math.min(prizes.weekly * rounds, total);
  const remaining = total - weekly;

  const count = prizes.places ?? placesFor(managers);
  const shares = prizes.shares?.length ? prizes.shares : defaultShares(count);
  const sum = shares.reduce((running, share) => running + share, 0) || 100;

  return {
    total,
    weekly,
    places: remaining,
    payouts: shares.map((share, index) => ({
      place: index + 1,
      share,
      // Normalised by whatever the shares actually add up to, so a table that does not total 100
      // still divides the pot instead of inventing or losing money.
      amount: Math.round((remaining * share) / sum),
    })),
    weeklySpots: prizes.weekly > 0 ? [prizes.weekly] : [],
  };
}

/**
 * How many people the payouts are sized on.
 *
 * With a payout plan, only those the commissioner has marked as paid — Ray: "it should only count
 * once i hit the paid button". Without one (the autumn rehearsal's simple settings) it is everybody
 * entered, as it always was, so a finished contest keeps the result it was given.
 */
export function fieldFor(prizes: Prizes | undefined, entered: number, paid: number | null): number {
  return prizes?.plan ? (paid ?? 0) : entered;
}

/** What is actually in hand, as against what the field is worth if everybody pays. */
export const collected = (paid: number, buyIn: number): number => paid * buyIn;
