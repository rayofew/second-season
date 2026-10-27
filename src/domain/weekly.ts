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

export interface WeekPaid {
  round: number;
  /** Everybody paid that round, best raw score first. A dead heat splits the spots it covers. */
  paid: { entryId: string; name: string; raw: number; amount: number }[];
}

/**
 * Who is paid each round when the weekly prize pays more than one spot.
 *
 * Raw points, multipliers ignored, exactly as weeklyWins — so a man out of the contest can still
 * take a week. Two managers level on the same score share what their spots were worth between them,
 * the same way the places do, because two people tied for second have earned second and third
 * between them, not two seconds.
 */
export function weeklyPaid(entries: readonly EntryScore[], spots: readonly number[]): WeekPaid[] {
  const rounds = Math.max(0, ...entries.map((entry) => entry.rounds.length));
  return Array.from({ length: rounds }, (_, round): WeekPaid => {
    const scored = entries
      .map((entry) => ({ entryId: entry.entryId, name: entry.name, raw: entry.rounds[round]?.raw ?? 0 }))
      .filter((entry) => entry.raw > 0)
      .sort((a, b) => b.raw - a.raw);
    const paid: WeekPaid['paid'] = [];
    let at = 0;
    while (at < scored.length && at < spots.length) {
      const level = scored.filter((entry) => Math.abs(entry.raw - scored[at]!.raw) < 1e-9);
      const covered = spots.slice(at, at + level.length).reduce((sum, value) => sum + value, 0);
      for (const entry of level) paid.push({ ...entry, amount: covered / level.length });
      at += level.length;
    }
    return { round, paid };
  });
}
