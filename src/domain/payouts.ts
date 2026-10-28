/**
 * How the pot is paid out, for a field of any size.
 *
 * Ray: "i want to start figuring out payouts based on the number of people playing ... from 5
 * people to 100", and then a calculator on Commish to play with the percentages and the weekly
 * spots. One formula could not do it: a curve that suits five people flattens a hundred-man field
 * until the winner takes a tenth, and one that suits a hundred makes five people's second place a
 * consolation prize. So, like a card room's payout chart, it is a table: each band of field sizes
 * has its own split, and the commissioner edits the bands.
 *
 * The weekly prize grows with the pot rather than staying at a flat ten dollars — a percentage of
 * the whole, divided over the rounds — and pays more spots once the field is big enough that one
 * winner a week is a lottery.
 *
 * Nothing here moves money. It is the arithmetic everybody can check, done once, in one place.
 */

export interface Tier {
  /** The largest field this band covers. Bands are read smallest first; the last covers anything bigger. */
  upTo: number;
  /** Percentages, first place first. Normalised by their sum, so a band that does not add to 100 still divides the pot. */
  shares: number[];
  /**
   * Weekly bands only: the dollars taken off the top for the best week, every round, at this field
   * size. Ray: "instead of a percentage, i want to designate how much is removed for best week".
   */
  amount?: number;
}

export interface Plan {
  buyIn: number;
  /** How the places split, by field size. */
  tiers: Tier[];
  /**
   * The weekly prizes as a percentage of the pot, spread over the rounds. Only used for a weekly band
   * that names no dollar amount; the calculator now sets dollars, so new plans never rely on it.
   */
  weeklyPercent?: number;
  /** How much each round's best week is worth, and how it splits between the best raw scores, by field size. */
  weeklyTiers: Tier[];
}

/**
 * The starting point the calculator opens on.
 *
 * Worked out in the October brainstorm: roughly one in five to one in seven paid, the winner never
 * below a quarter of the pot, and the last paid place always more than his buy-in back.
 */
export const DEFAULT_PLAN: Plan = {
  buyIn: 50,
  tiers: [
    { upTo: 7, shares: [65, 35] },
    { upTo: 11, shares: [50, 30, 20] },
    { upTo: 19, shares: [45, 27, 18, 10] },
    { upTo: 29, shares: [40, 24, 15, 12, 9] },
    { upTo: 49, shares: [34, 21, 14, 10, 8, 7, 6] },
    { upTo: 74, shares: [30, 18, 12, 9, 7, 6, 5, 5, 4, 4] },
    { upTo: 1000, shares: [27, 16, 11, 8, 6, 5, 4.5, 4, 3.5, 3, 3, 2.5, 2.5, 2, 2] },
  ],
  weeklyTiers: [
    { upTo: 19, shares: [100], amount: 10 },
    { upTo: 49, shares: [100], amount: 25 },
    { upTo: 74, shares: [60, 40], amount: 50 },
    { upTo: 1000, shares: [50, 30, 20], amount: 100 },
  ],
};

/** The band a field of this size falls into. The last band covers anything past the end of the table. */
export function tierFor(tiers: readonly Tier[], field: number): Tier | undefined {
  const sorted = [...tiers].sort((a, b) => a.upTo - b.upTo);
  return sorted.find((tier) => field <= tier.upTo) ?? sorted[sorted.length - 1];
}

/** The smallest field a band covers, which is one more than the band before it. */
export function tierFrom(tiers: readonly Tier[], tier: Tier): number {
  const sorted = [...tiers].sort((a, b) => a.upTo - b.upTo);
  const index = sorted.indexOf(tier);
  return index <= 0 ? 1 : sorted[index - 1]!.upTo + 1;
}

/**
 * Splits a sum by percentages into whole dollars that add back up to it exactly.
 *
 * Each share is rounded down, and the dollars that leaves over go to the top of the list, one at a
 * time — so first place absorbs the rounding and nobody is paid a cent that was never collected.
 */
export function split(amount: number, shares: readonly number[]): number[] {
  const whole = Math.max(0, Math.floor(amount));
  const sum = shares.reduce((total, share) => total + Math.max(0, share), 0);
  if (sum <= 0 || shares.length === 0) return [];
  const paid = shares.map((share) => Math.floor((whole * Math.max(0, share)) / sum));
  let left = whole - paid.reduce((total, value) => total + value, 0);
  for (let index = 0; left > 0; index = (index + 1) % paid.length, left -= 1) paid[index]! += 1;
  return paid;
}

export interface Breakdown {
  field: number;
  pot: number;
  /** What each weekly spot is worth in every round, best raw score first. */
  weeklySpots: number[];
  /** Every weekly prize across every round. */
  weeklyTotal: number;
  /** What the places divide. */
  placesPool: number;
  /** Dollars per place, first place first. */
  places: number[];
  /** Percentages behind each place, as the band states them. */
  shares: number[];
}

/** Where every dollar of a field of this size goes. */
export function breakdown(field: number, plan: Plan, rounds: number): Breakdown {
  const size = Math.max(0, Math.floor(field));
  const pot = size * Math.max(0, plan.buyIn);
  const weeklyTier = tierFor(plan.weeklyTiers, size);
  // Dollars as the commissioner set them for this size of field — or, for an old plan written as a
  // percentage, worked out from the pot. Never more than the whole pot can cover over every round.
  const asked = weeklyTier?.amount !== undefined
    ? Math.max(0, Math.floor(weeklyTier.amount))
    : Math.floor((pot * Math.max(0, plan.weeklyPercent ?? 0)) / 100 / Math.max(1, rounds));
  const weeklyRound = Math.min(asked, Math.floor(pot / Math.max(1, rounds)));
  const weeklyShares = weeklyTier?.shares ?? [100];
  const weeklySpots = weeklyRound > 0 ? split(weeklyRound, weeklyShares) : [];
  const weeklyTotal = weeklySpots.reduce((sum, value) => sum + value, 0) * rounds;
  const placesPool = pot - weeklyTotal;
  const shares = tierFor(plan.tiers, size)?.shares ?? [100];
  // Never more places than people: three places in a field of two would pay somebody who is not there.
  const payable = shares.slice(0, Math.max(1, size));
  return { field: size, pot, weeklySpots, weeklyTotal, placesPool, places: split(placesPool, payable), shares: payable };
}

/** What is wrong with a plan, in words, or nothing. The calculator refuses to lock one with problems. */
export function problems(plan: Plan): string[] {
  const found: string[] = [];
  if (!(plan.buyIn > 0)) found.push('Set a buy-in above $0.');
  for (const tier of plan.weeklyTiers) {
    if (tier.amount !== undefined && !(tier.amount >= 0)) found.push(`Weekly: the band up to ${tier.upTo} needs a dollar amount of $0 or more.`);
  }
  const check = (tiers: readonly Tier[], what: string) => {
    if (tiers.length === 0) found.push(`${what}: add at least one band.`);
    const sizes = tiers.map((tier) => tier.upTo);
    if (new Set(sizes).size !== sizes.length) found.push(`${what}: two bands end at the same field size.`);
    for (const tier of tiers) {
      const sum = Math.round(tier.shares.reduce((total, share) => total + share, 0) * 100) / 100;
      if (tier.shares.length === 0) found.push(`${what}: the band up to ${tier.upTo} pays nobody.`);
      else if (sum !== 100) found.push(`${what}: the band up to ${tier.upTo} adds up to ${sum}%, not 100%.`);
      if (tier.shares.some((share, index) => index > 0 && share > tier.shares[index - 1]!)) {
        found.push(`${what}: in the band up to ${tier.upTo}, a lower place pays more than the one above it.`);
      }
    }
  };
  check(plan.tiers, 'Places');
  check(plan.weeklyTiers, 'Weekly');
  return found;
}

/** "45/27/18/10" for an input box, and back. */
export const sharesText = (shares: readonly number[]) => shares.join('/');
export const parseShares = (text: string): number[] =>
  text.split(/[\s/,]+/).map((part) => Number(part)).filter((value) => Number.isFinite(value) && value > 0);

/** The whole weekly purse as a share of the pot, so the calculator can flag a field where it eats the places. */
export const weeklyShareOfPot = (paid: Breakdown): number => (paid.pot > 0 ? paid.weeklyTotal / paid.pot : 0);

/**
 * The plan cut down to a player cap: the bands nobody can reach are dropped, and the last one left
 * covers everything up to the cap.
 *
 * Ray: "this way the table can make an auto adjustment suggestion based on that". A game capped at
 * 30 has no use for bands that start at 50 or 75, and leaving them in makes the table, the ladder
 * and the Rules page describe payouts that can never happen. Offered as a suggestion the
 * commissioner accepts, not applied behind his back, so it never overwrites his own edits.
 */
export function fitToCap(plan: Plan, cap: number): Plan {
  const trim = (tiers: readonly Tier[]): Tier[] => {
    const sorted = [...tiers].sort((a, b) => a.upTo - b.upTo);
    const kept = sorted.filter((tier) => tierFrom(sorted, tier) <= cap);
    if (kept.length === 0) return sorted.slice(0, 1).map((tier) => ({ ...tier, upTo: cap }));
    return kept.map((tier, index) => (index === kept.length - 1 ? { ...tier, upTo: cap } : { ...tier, upTo: Math.min(tier.upTo, cap) }));
  };
  return { ...plan, tiers: trim(plan.tiers), weeklyTiers: trim(plan.weeklyTiers) };
}

/** Field sizes worth showing in a ladder: the usual ones up to the cap, and the cap itself. */
export function sampleSizes(cap: number | null | undefined, usual: readonly number[] = [5, 10, 15, 20, 30, 50, 75, 100]): number[] {
  if (!cap) return [...usual];
  return [...new Set([...usual.filter((size) => size < cap), cap])];
}
