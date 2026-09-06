/**
 * The prize pool, and how it splits.
 *
 * Nothing here moves money. It records what the buy-in is, who has paid and what each place would
 * get, which is the part that otherwise lives in a group chat and gets argued about in February.
 * Settling up stays between people.
 */

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
}

export function pot(managers: number, prizes: Prizes, rounds: number): Pot {
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
  };
}

/** What is actually in hand, as against what the field is worth if everybody pays. */
export const collected = (paid: number, buyIn: number): number => paid * buyIn;
