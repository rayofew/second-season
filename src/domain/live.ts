import { creditedPoints } from './multiplier.ts';

/**
 * What a roster is worth while the football is still going on.
 *
 * A man who has not kicked off yet is carried at his projection. Leaving him out would show a
 * Sunday-morning score of nothing and a Sunday-night score out of nowhere, and a screen that swings
 * like that teaches people not to look at it.
 *
 * Once his game has started he is worth what he has actually done. A projection is a guess about a
 * game nobody has watched; the moment there is a real number, the guess stops being interesting.
 */

export type ClubState = 'upcoming' | 'playing' | 'final';

export interface LiveInput {
  playerId: string;
  slot: string;
  multiplier: number;
  /** What he has actually scored so far. Zero for a man who has not played. */
  raw: number;
  /** What he was expected to score across the whole game. */
  projected: number;
  state: ClubState;
}

export interface LivePlayer extends LiveInput {
  /** The figure being counted: real points once his game has started, his projection before that. */
  counting: number;
  credited: number;
}

export interface LiveTotal {
  players: LivePlayer[];
  /** Credited points, counting projections for anybody yet to play. */
  running: number;
  /** Credited points from games that have actually finished. */
  banked: number;
  yetToPlay: number;
  playing: number;
}

export function liveRoster(inputs: readonly LiveInput[]): LiveTotal {
  const players = inputs.map((input): LivePlayer => {
    const counting = input.state === 'upcoming' ? input.projected : input.raw;
    return { ...input, counting, credited: creditedPoints(counting, input.multiplier) };
  });

  return {
    players,
    running: players.reduce((sum, player) => sum + player.credited, 0),
    banked: players
      .filter((player) => player.state === 'final')
      .reduce((sum, player) => sum + player.credited, 0),
    yetToPlay: players.filter((player) => player.state === 'upcoming').length,
    playing: players.filter((player) => player.state === 'playing').length,
  };
}
