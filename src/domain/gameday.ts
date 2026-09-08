import type { ClubState, LivePlayer } from './live.ts';

/**
 * A roster rearranged into the games it is actually spread across.
 *
 * The team screen lists nine men by slot, which is the right shape for picking them and the wrong
 * shape for watching them. On a Sunday nobody thinks "how is my flex doing" — they think "the
 * Seattle game is on, who have I got in it". This turns one into the other.
 *
 * A fixture appears once however many of your men are in it, including men on opposite sides: hold
 * a quarterback and the defense facing him and they belong in the same box, watching each other.
 */

/** As much of a club's fixture as this needs. Structurally a ClubGame, without importing one. */
export interface Fixture {
  points: number;
  state: ClubState;
  kickoff: Date;
  against: string;
  home: boolean;
  clock: string;
}

export interface GameGroup {
  /** Both clubs in a fixed order, so the same fixture is the same group from either side. */
  id: string;
  home: string;
  away: string;
  homePoints: number;
  awayPoints: number;
  state: ClubState;
  kickoff: Date;
  clock: string;
  /** Your men in this game, in the order they were handed over — which is slot order. */
  players: LivePlayer[];
}

export interface GameDay {
  games: GameGroup[];
  /** Men whose club is not playing at all: a bye, or a fixture the feed does not have. */
  resting: LivePlayer[];
}

/**
 * Unresolved first, because that is what anybody is looking at.
 *
 * Games in progress, then games still to come, then the ones already banked. A finished game is
 * reference; the other two are the afternoon.
 */
const ORDER: Record<ClubState, number> = { playing: 0, upcoming: 1, final: 2 };

export function byGame(
  players: readonly LivePlayer[],
  clubOf: (playerId: string) => string | undefined,
  games: ReadonlyMap<string, Fixture>,
): GameDay {
  const groups = new Map<string, GameGroup>();
  const resting: LivePlayer[] = [];

  for (const player of players) {
    const club = clubOf(player.playerId);
    const fixture = club ? games.get(club) : undefined;
    if (!club || !fixture || !fixture.against) {
      resting.push(player);
      continue;
    }

    const home = fixture.home ? club : fixture.against;
    const away = fixture.home ? fixture.against : club;
    const id = `${away}@${home}`;
    const existing = groups.get(id);
    if (existing) {
      existing.players.push(player);
      continue;
    }

    // The other club's score comes from its own entry, which the feed always writes for both sides.
    const other = games.get(fixture.against);
    groups.set(id, {
      id,
      home,
      away,
      homePoints: fixture.home ? fixture.points : (other?.points ?? 0),
      awayPoints: fixture.home ? (other?.points ?? 0) : fixture.points,
      state: fixture.state,
      kickoff: fixture.kickoff,
      clock: fixture.clock,
      players: [player],
    });
  }

  return {
    games: [...groups.values()].sort(
      (first, second) =>
        ORDER[first.state] - ORDER[second.state] ||
        first.kickoff.getTime() - second.kickoff.getTime() ||
        first.id.localeCompare(second.id),
    ),
    resting,
  };
}

/** What a group is worth, so a game can say what it has done for you without the caller adding up. */
export const groupCredited = (group: GameGroup): number =>
  group.players.reduce((sum, player) => sum + player.credited, 0);
