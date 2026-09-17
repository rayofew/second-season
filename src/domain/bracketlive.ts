import { decide } from './advance.ts';
import type { Field, Matchup } from './advance.ts';
import type { ClubState } from './live.ts';

/**
 * A bracket tie as it currently stands, while the football is still going on.
 *
 * Two shapes, told apart by the schedule rather than by a setting. In the rehearsal the two clubs
 * never meet, so each plays whoever the real week gave him and the one who scores more goes
 * through — two scorelines under one pairing. In January they play each other, and it collapses
 * to the single scoreline everybody expects. Nothing has to be remembered and flipped in December:
 * if Sleeper says these two are each other's fixture, they are.
 *
 * The verdict comes from decide(), the same function that settles the round on Monday night, so
 * what the screen says during the games cannot disagree with what actually happens — tiebreakers
 * included, which is the case nobody will believe when it arrives.
 */

export interface Fixture {
  points: number;
  state: ClubState;
  kickoff: Date;
  against: string;
  home: boolean;
  clock: string;
  projected?: number;
}

export interface Side {
  club: string;
  seed: number;
  /** What his own real fixture has him on. */
  points: number;
  against: string;
  /** True when he is at home in his own fixture, which is not the bracket's idea of home. */
  home: boolean;
  state: ClubState;
  clock: string;
  kickoff: Date | null;
  /** What the market expects him to score. Absent where no book has priced the game. */
  projected?: number;
}

export interface LiveTie {
  home: string;
  away: string;
  sides: [Side, Side];
  /** True when these two are actually playing each other, which is every January tie. */
  headToHead: boolean;
  /** Whoever would go through if it ended now. Null before anybody has taken the field. */
  leading: string | null;
  /** Said in words, and honest about what has not happened yet. */
  state: string;
  /** Both fixtures finished, so the answer will not change. */
  settled: boolean;
}

const blank = (club: string, seed: number): Side => ({
  club, seed, points: 0, against: '', home: false, state: 'upcoming', clock: '', kickoff: null,
});

const when = (side: Side) =>
  side.kickoff
    ? side.kickoff.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : 'a time to come';

export function liveTie(
  matchup: Matchup,
  fixtures: ReadonlyMap<string, Fixture>,
  field: Field,
  passingYardsFor: (club: string) => number,
): LiveTie {
  const sideOf = (club: string): Side => {
    const fixture = fixtures.get(club);
    const seed = field[club]?.seed ?? 0;
    if (!fixture) return blank(club, seed);
    return {
      club,
      seed,
      points: fixture.points,
      against: fixture.against,
      home: fixture.home,
      state: fixture.state,
      clock: fixture.clock,
      kickoff: fixture.kickoff,
      projected: fixture.projected,
    };
  };

  const sides: [Side, Side] = [sideOf(matchup.away), sideOf(matchup.home)];
  const [away, home] = sides;
  const headToHead = away.against === home.club && home.against === away.club;

  const played = sides.filter((side) => side.state !== 'upcoming');
  const settled = sides.every((side) => side.state === 'final');
  const waiting = sides.filter((side) => side.state === 'upcoming');

  if (played.length === 0) {
    return {
      ...matchup,
      sides,
      headToHead,
      leading: null,
      state: `Kicks off ${when(away)}`,
      settled: false,
    };
  }

  const verdict = decide(
    matchup,
    (club) => (club === home.club ? home.points : away.points),
    passingYardsFor,
    field,
  );

  /**
   * One club finished and the other yet to play is not a lead, and calling it one would be the
   * most misleading thing on the screen: the Chargers at ten in the morning look inevitable until
   * New England kicks off at half past one.
   */
  if (waiting.length > 0) {
    const ahead = waiting[0]!;
    return {
      ...matchup,
      sides,
      headToHead,
      leading: null,
      state: `${played[0]!.club} ${played[0]!.points}${played[0]!.state === 'final' ? ' final' : ''}`
        + ` · ${ahead.club} kicks off ${when(ahead)}`,
      settled: false,
    };
  }

  return {
    ...matchup,
    sides,
    headToHead,
    leading: verdict.winner,
    state: settled ? `${verdict.winner} through` : `${verdict.winner} ahead`,
    settled,
  };
}

/** How it was decided, for a tie close enough that somebody will want telling. */
export function whyLeading(
  tie: LiveTie,
  field: Field,
  passingYardsFor: (club: string) => number,
): string | null {
  if (!tie.leading) return null;
  const [away, home] = tie.sides;
  if (away.points !== home.points) return null;
  return decide(
    { home: home.club, away: away.club, winner: null },
    (club) => (club === home.club ? home.points : away.points),
    passingYardsFor,
    field,
  ).why;
}
