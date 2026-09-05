/**
 * The prize pool, and how it splits.
 *
 * Nothing here moves money. It records what the buy-in is, who has paid and what each place would
 * get, which is the part that otherwise lives in a group chat and gets argued about in February.
 * Settling up stays between people.
 *
 * How many places pay grows with the field, because paying three out of twenty leaves most of the
 * room with nothing to play for by the third round.
 */

export interface Payout {
  place: number;
  share: number;
  amount: number;
}

/** A sensible number of paid places for a field of this size. */
export function placesFor(managers: number): number {
  if (managers <= 6) return 2;
  if (managers <= 12) return 3;
  if (managers <= 18) return 4;
  return 5;
}

/**
 * How the pot divides, steeply enough that winning is worth more than placing.
 *
 * Written out rather than computed from a curve: these are the shapes people actually use, and a
 * formula that produced 37.4% would only invite argument.
 */
const SHARES: Record<number, number[]> = {
  1: [100],
  2: [65, 35],
  3: [50, 30, 20],
  4: [45, 27, 18, 10],
  5: [40, 25, 15, 12, 8],
};

export function payouts(managers: number, buyIn: number, places = placesFor(managers)): Payout[] {
  const shares = SHARES[Math.min(Math.max(places, 1), 5)] ?? SHARES[3]!;
  const pot = managers * buyIn;
  return shares.map((share, index) => ({
    place: index + 1,
    share,
    // Rounded to whole dollars, because nobody wants to hand somebody 63 cents.
    amount: Math.round((pot * share) / 100),
  }));
}

/** What is actually in hand, as against what the field is worth if everybody pays. */
export const collected = (paid: number, buyIn: number): number => paid * buyIn;
