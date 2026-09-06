import { EASTSIDE } from './rules.ts';
import type { ContestSettings, Position, Tiebreaker } from './rules.ts';
import { creditedPoints, standingsFor } from './multiplier.ts';
import type { RosterHistory } from './multiplier.ts';
import { rawPoints } from './scoring.ts';
import type { StatLine } from './scoring.ts';

/**
 * The table, and what to do when two managers finish tied.
 *
 * Everything here is derived. Nothing is stored and later trusted: give it the rosters and the stat
 * lines and it recomputes the whole contest from the beginning. That is what makes a scoring
 * correction safe — the commissioner fixes a stat line, this runs again, and every round and every
 * cumulative total follows without anyone having to remember what depended on what.
 */

export interface Entry {
  entryId: string;
  name: string;
  history: RosterHistory;
  /** Points guessed for the Super Bowl before the contest locked, if the league collects them. */
  prediction?: number;
  /** The commissioner's own order, used only when everything else has failed to separate two. */
  commissionerRank?: number;
}

export interface Contest {
  /** One stat file per round, in playing order. */
  statsByRound: readonly Record<string, StatLine>[];
  /** What the Super Bowl actually totalled, once it is known. */
  superBowlTotal?: number;
}

export interface PlayerScore {
  playerId: string;
  position: Position;
  slot: string;
  streak: number;
  multiplier: number;
  retained: boolean;
  raw: number;
  credited: number;
}

export interface RoundScore {
  round: number;
  raw: number;
  credited: number;
  /** Every man who was on the roster, so the arithmetic on screen can be checked by eye. */
  players: PlayerScore[];
}

export interface EntryScore {
  entryId: string;
  name: string;
  rounds: RoundScore[];
  raw: number;
  credited: number;
}

export interface Placing extends EntryScore {
  rank: number;
  /** Which rule separated this entry from the one above, when the totals could not. */
  decidedBy: Tiebreaker['kind'] | null;
}

/** One manager's contest, round by round. */
export function scoreEntry(
  entry: Entry,
  contest: Contest,
  settings: ContestSettings = EASTSIDE,
): EntryScore {
  const rounds = entry.history.map((_, round): RoundScore => {
    const lines = contest.statsByRound[round] ?? {};

    const players = standingsFor(entry.history, round, settings).map((standing): PlayerScore => {
      // Raw first, always. The multiplier is applied to a figure that is already final.
      const raw = rawPoints(standing.position, lines[standing.playerId], settings);
      return {
        playerId: standing.playerId,
        position: standing.position,
        slot: standing.slot,
        streak: standing.streak,
        multiplier: standing.multiplier,
        retained: standing.retained,
        raw,
        credited: creditedPoints(raw, standing.multiplier),
      };
    });

    return {
      round,
      raw: players.reduce((sum, player) => sum + player.raw, 0),
      credited: players.reduce((sum, player) => sum + player.credited, 0),
      players,
    };
  });

  return {
    entryId: entry.entryId,
    name: entry.name,
    rounds,
    raw: rounds.reduce((sum, round) => sum + round.raw, 0),
    credited: rounds.reduce((sum, round) => sum + round.credited, 0),
  };
}

/**
 * Compares two tied entries by one rule, positive when the first should place higher.
 *
 * A rule nobody can answer separates nobody: an entry with no prediction does not beat an entry
 * that also has none, and neither of them beats anyone by default.
 */
function breakTie(
  rule: Tiebreaker,
  first: { score: EntryScore; entry: Entry },
  second: { score: EntryScore; entry: Entry },
  contest: Contest,
): number {
  switch (rule.kind) {
    case 'roundScore':
      return (first.score.rounds[rule.round]?.credited ?? 0) - (second.score.rounds[rule.round]?.credited ?? 0);
    case 'rawPoints':
      return first.score.raw - second.score.raw;
    case 'prediction': {
      if (contest.superBowlTotal === undefined) return 0;
      const distance = (guess: number | undefined) =>
        guess === undefined ? Infinity : Math.abs(guess - contest.superBowlTotal!);
      // Closest wins, so the smaller distance places higher.
      return distance(second.entry.prediction) - distance(first.entry.prediction);
    }
    case 'commissioner': {
      const order = (rank: number | undefined) => rank ?? Infinity;
      return order(second.entry.commissionerRank) - order(first.entry.commissionerRank);
    }
  }
}

/**
 * The table, best first.
 *
 * Two entries that survive every tiebreaker share a rank rather than being ordered arbitrarily,
 * because a coin flip dressed up as a standing is worse than an honest dead heat — and the
 * commissioner has a rule of his own for exactly that case if he wants to use it.
 */
export function table(
  entries: readonly Entry[],
  contest: Contest,
  settings: ContestSettings = EASTSIDE,
): Placing[] {
  const scored = entries.map((entry) => ({ entry, score: scoreEntry(entry, contest, settings) }));

  const separate = (a: (typeof scored)[number], b: (typeof scored)[number]) => {
    const byPoints = b.score.credited - a.score.credited;
    if (Math.abs(byPoints) > 1e-9) return { order: byPoints, by: null as Tiebreaker['kind'] | null };

    for (const rule of settings.tiebreakers) {
      const decided = breakTie(rule, b, a, contest);
      if (Math.abs(decided) > 1e-9) return { order: decided, by: rule.kind };
    }
    return { order: 0, by: null as Tiebreaker['kind'] | null };
  };

  const ordered = [...scored].sort((a, b) => separate(a, b).order);

  const placings: Placing[] = [];
  ordered.forEach((current, index) => {
    const above = ordered[index - 1];
    const gap = above ? separate(above, current) : null;
    // A dead heat that no rule could break shares the rank above it.
    const tied = gap !== null && gap.order === 0;
    placings.push({
      ...current.score,
      rank: tied ? placings[index - 1]!.rank : index + 1,
      decidedBy: gap && gap.order !== 0 ? gap.by : null,
    });
  });

  return placings;
}
