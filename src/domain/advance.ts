/**
 * Who goes through, and who plays whom next.
 *
 * Our clubs never meet, so a tie is settled by what each did in whatever fixture the real schedule
 * gave them: most points, then the quarterback with more passing yards, then the better seed.
 * Always decisive, and needing no relationship between the two real games at all.
 *
 * Pure, and shared by the script and the commissioner's screen — two implementations of "who won"
 * is the last thing this needs.
 */

export interface Matchup {
  home: string;
  away: string;
  winner: string | null;
}

export interface Seeding {
  conference: string;
  seed: number;
}

export type Field = Record<string, Seeding>;

export interface Decision extends Matchup {
  winner: string;
  /** Why, in words, so a commissioner can check it against what he watched. */
  why: string;
}

export function decide(
  matchup: Matchup,
  pointsFor: (club: string) => number,
  passingYardsFor: (club: string) => number,
  field: Field,
): Decision {
  const { home, away } = matchup;
  const [homePoints, awayPoints] = [pointsFor(home), pointsFor(away)];
  if (homePoints !== awayPoints) {
    return { ...matchup, winner: homePoints > awayPoints ? home : away, why: `${away} ${awayPoints}, ${home} ${homePoints}` };
  }

  const [homeYards, awayYards] = [passingYardsFor(home), passingYardsFor(away)];
  if (homeYards !== awayYards) {
    return {
      ...matchup,
      winner: homeYards > awayYards ? home : away,
      why: `both ${homePoints}; passing yards ${away} ${awayYards}, ${home} ${homeYards}`,
    };
  }

  const better = (field[home]?.seed ?? 99) < (field[away]?.seed ?? 99) ? home : away;
  return { ...matchup, winner: better, why: `tied on both; ${better} is the better seed` };
}

/**
 * The next round's pairings: best surviving seed against worst, within each conference.
 *
 * The final is the exception — the last two standing meet whatever conferences they came from,
 * which is the only time the two halves of the bracket touch.
 */
export function reseed(through: readonly string[], field: Field): Matchup[] {
  const pairings: Matchup[] = [];

  for (const conference of ['AFC', 'NFC']) {
    const survivors = through
      .filter((club) => field[club]?.conference === conference)
      .sort((a, b) => (field[a]?.seed ?? 99) - (field[b]?.seed ?? 99));
    for (let index = 0; index < Math.floor(survivors.length / 2); index += 1) {
      pairings.push({ home: survivors[index]!, away: survivors[survivors.length - 1 - index]!, winner: null });
    }
  }

  if (pairings.length === 0 && through.length === 2) {
    pairings.push({ home: through[0]!, away: through[1]!, winner: null });
  }
  return pairings;
}
