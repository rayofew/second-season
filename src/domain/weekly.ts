import type { EntryScore } from './standings.ts';

/**
 * Who won each week, which is a different contest from who is winning.
 *
 * The weekly prize is raw points for one round with the multipliers ignored — deliberately, so a
 * manager whose contest ended in the Wild Card round still has something to play for in January.
 * Being ahead overall has nothing to do with it: forty raw points beats eighty credited.
 *
 * A week nobody scored in has no winner rather than fifteen of them. That happens before a round is
 * played, and the standings screen asks for every round including the one in progress.
 */

export interface WeekWin {
  round: number;
  /** Everybody who scored the most that week. Normally one; a dead heat is shared, not broken. */
  winners: { entryId: string; name: string }[];
  raw: number;
}

export function weeklyWins(entries: readonly EntryScore[]): WeekWin[] {
  const rounds = Math.max(0, ...entries.map((entry) => entry.rounds.length));

  return Array.from({ length: rounds }, (_, round): WeekWin => {
    const scores = entries.map((entry) => ({
      entryId: entry.entryId,
      name: entry.name,
      raw: entry.rounds[round]?.raw ?? 0,
    }));
    const best = Math.max(0, ...scores.map((score) => score.raw));

    return {
      round,
      // Nobody wins a week nobody has played.
      winners: best > 0 ? scores.filter((score) => Math.abs(score.raw - best) < 1e-9) : [],
      raw: best,
    };
  });
}

/** How many weeks each manager has won, for the chip beside a name in the table. */
export function winCounts(wins: readonly WeekWin[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const week of wins) {
    for (const winner of week.winners) {
      counts.set(winner.entryId, (counts.get(winner.entryId) ?? 0) + 1);
    }
  }
  return counts;
}
