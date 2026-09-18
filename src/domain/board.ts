import type { LivePlayer } from './live.ts';

/**
 * The league ranked while the football is still going on.
 *
 * Two races run at once and they are not the same race. The contest is credited points, multipliers
 * and all, carried forward from every round before this one. The weekly prize is raw points for
 * this round alone with multipliers ignored — deliberately, so it stays winnable by somebody whose
 * contest ended in the Wild Card round. One list, one switch, because it is the same ten people.
 *
 * Every row carries what is already banked as well as what it is running at, because two managers
 * on the same number are in completely different positions if one of them has three men yet to
 * kick off. A leaderboard that hides that is wrong all Sunday and right at midnight.
 */

export type Race = 'contest' | 'week';

export interface BoardInput {
  entryId: string;
  name: string;
  /** Credited points from every round before this one. Nothing to do with the weekly race. */
  before: number;
  players: readonly LivePlayer[];
}

export interface BoardRow extends BoardInput {
  /** Credited this round, counting projections for anybody yet to play. */
  running: number;
  /** Credited this round from games that have actually finished. */
  banked: number;
  /** Raw points this round, multipliers ignored. The weekly prize. */
  raw: number;
  /** What this row is running at, counting projections for anybody yet to play. */
  total: number;
  /**
   * Points that have actually been scored — nothing expected, nothing guessed.
   *
   * On a Sunday morning this is nought and the total is a hundred and forty, and a row showing
   * only the second is telling somebody he has a hundred and forty points. He has none yet.
   *
   * This is what the board is ranked on. Ranking on the projection instead put a man with
   * seventeen points above one with fifty-two because a computer somewhere likes his afternoon,
   * which is not a leaderboard, it is a forecast with places on it.
   */
  scored: number;
  /** How much of the total is real rather than expected, from 0 to 1. */
  settled: number;
  done: number;
  playing: number;
  left: number;
  rank: number;
  /** Points actually scored behind the leader, or 0 for the leader. */
  behind: number;
}

const sum = (players: readonly LivePlayer[], of: (player: LivePlayer) => number) =>
  players.reduce((running, player) => running + of(player), 0);

export function board(entries: readonly BoardInput[], race: Race): BoardRow[] {
  const rows = entries.map((entry): Omit<BoardRow, 'rank' | 'behind'> => {
    const { players } = entry;
    const running = sum(players, (player) => player.credited);
    const banked = sum(
      players.filter((player) => player.state === 'final'),
      (player) => player.credited,
    );
    const raw = sum(players, (player) => player.counting);

    // A man whose game is under way has real points, finished or not. Only the ones yet to kick
    // off are being guessed at, so only they are left out of what has actually been scored.
    const started = players.filter((player) => player.state !== 'upcoming');
    const total = race === 'week' ? raw : entry.before + running;
    const scored = race === 'week'
      ? sum(started, (player) => player.counting)
      : entry.before + sum(started, (player) => player.credited);

    return {
      ...entry,
      running,
      banked,
      raw,
      total,
      scored,
      // Against the round's own running total, so the bar means the same thing on every row
      // whatever anybody is carrying in from previous weeks.
      settled: running === 0 ? 0 : Math.min(1, banked / running),
      done: players.filter((player) => player.state === 'final').length,
      playing: players.filter((player) => player.state === 'playing').length,
      left: players.filter((player) => player.state === 'upcoming').length,
    };
  });

  /**
   * Ordered by what has actually been scored, best first.
   *
   * Where two managers have scored the same — which on a Sunday morning is everybody, on nought —
   * the one running at more goes above. That is an order to read the list in, not a claim about
   * who is ahead: the ranks below still share.
   */
  const sorted = [...rows].sort(
    (first, second) => second.scored - first.scored || second.total - first.total,
  );
  const best = sorted[0]?.scored ?? 0;

  /**
   * Equal scores share a rank and the next one skips, as places do everywhere else.
   *
   * Nothing here breaks a tie. The contest has tiebreakers and they are settled figures applied at
   * the end; inventing an order mid-afternoon would show a separation that does not exist.
   */
  let rank = 0;
  let previous: number | null = null;
  return sorted.map((row, index) => {
    if (previous === null || Math.abs(row.scored - previous) > 1e-9) {
      rank = index + 1;
      previous = row.scored;
    }
    return { ...row, rank, behind: best - row.scored };
  });
}
