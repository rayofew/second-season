import { EASTSIDE } from './rules.ts';
import type { ContestSettings, Position } from './rules.ts';
import { projectedPoints, rawPoints } from './scoring.ts';
import type { StatLine } from './scoring.ts';
import type { ClubState } from './live.ts';

/**
 * What every club is producing, and who in it is producing it.
 *
 * Arranged by club rather than as one long list of players, because that is how football is
 * watched: the Seattle game is on, so what is Seattle worth. A flat table of a hundred and forty
 * names sorted by points answers a question nobody asked.
 *
 * A club's own defense is one of its players here, not eleven of them. That is what the league
 * picks and what Sleeper scores, and listing the linebackers individually would be listing men
 * nobody can own.
 */

export interface PlayerPoints {
  id: string;
  name: string;
  position: string;
  team: string;
  /** What he has actually scored. Zero until his game starts, which is honest rather than missing. */
  points: number;
  projected: number;
  /** The figure being counted right now: real once his game began, his projection before that. */
  counting: number;
  state: ClubState;
  /** The line the counting figure came from, so a row can show what he did. */
  line: StatLine | undefined;
}

export interface ClubPoints {
  club: string;
  /** Actual fantasy points from this club's men, in this league's scoring. */
  points: number;
  projected: number;
  state: ClubState;
  players: PlayerPoints[];
}

export interface Named {
  id: string;
  name: string;
  position: string;
  team: string;
}

export function clubPoints(
  pool: readonly Named[],
  actual: Record<string, StatLine>,
  expected: Record<string, StatLine>,
  stateOf: (club: string) => ClubState,
  settings: ContestSettings = EASTSIDE,
): Map<string, ClubPoints> {
  const clubs = new Map<string, ClubPoints>();

  for (const player of pool) {
    if (!player.team) continue;
    const state = stateOf(player.team);
    const position = player.position as Position;
    const points = rawPoints(position, actual[player.id], settings);
    const projected = projectedPoints(position, expected[player.id], settings);

    const entry: PlayerPoints = {
      ...player,
      points,
      projected,
      counting: state === 'upcoming' ? projected : points,
      state,
      line: state === 'upcoming' ? expected[player.id] : actual[player.id],
    };

    const found = clubs.get(player.team);
    if (found) {
      found.players.push(entry);
      found.points += points;
      found.projected += projected;
    } else {
      clubs.set(player.team, {
        club: player.team,
        points,
        projected,
        state,
        players: [entry],
      });
    }
  }

  /**
   * Whoever is doing most, first — by what he has actually done once the game is on, and by what he
   * is expected to do before it. Sorting a not-yet-started club by zero would order it alphabetically
   * by accident and tell nobody anything.
   */
  for (const club of clubs.values()) {
    club.players.sort((first, second) => second.counting - first.counting);
  }
  return clubs;
}

/** An empty club, so a fixture with nobody in our pool still draws rather than vanishing. */
export const noPoints = (club: string, state: ClubState): ClubPoints => ({
  club, points: 0, projected: 0, state, players: [],
});
