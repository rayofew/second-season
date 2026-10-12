import { EASTSIDE } from '../domain/rules.ts';
import { table } from '../domain/standings.ts';
import type { Entry, Placing } from '../domain/standings.ts';
import type { HeldPlayer } from '../domain/multiplier.ts';
import type { StatLine } from '../domain/scoring.ts';
import { readAllRosters, readContest, readCorrections, readEntries, readPool, readScores } from './firestore.ts';
import type { Contest, Manager, PoolPlayer } from './firestore.ts';

/**
 * Everything the table is made of, read once.
 *
 * Standings and the results on Home both need exactly this, and two copies of it would be two
 * chances to disagree about who won. Nothing is read from a stored standing: rosters and stat lines
 * go in and the same table() that settles the contest comes out, so a corrected statistic changes
 * the result by being corrected.
 *
 * Only rounds that have locked are fetched. Before a lock the rules refuse one manager another's
 * roster, which is the rule working rather than an obstacle to it.
 */
export interface Loaded {
  contest: Contest;
  /** Empty until the first round has locked. */
  placings: Placing[];
  managers: Manager[];
  players: Map<string, PoolPlayer>;
  /** The names of the rounds that have locked, in order. */
  roundNames: string[];
  /** When the round now being picked locks, if it has not yet. */
  nextLock: Date | null;
}

export async function loadTable(contestId: string): Promise<Loaded | null> {
  const contest = await readContest(contestId);
  if (!contest) return null;

  const now = new Date();
  const locked = contest.rounds.filter((round) => (contest.locks[String(round.round)] ?? now) <= now);
  const [people, board] = await Promise.all([readEntries(contestId), readPool(contestId)]);
  const loaded: Loaded = {
    contest,
    placings: [],
    managers: people,
    players: new Map(board.map((player) => [player.id, player])),
    roundNames: locked.map((round) => round.name),
    nextLock: contest.locks[String(contest.currentRound)] ?? null,
  };
  if (locked.length === 0) return loaded;

  const uids = people.map((person) => person.uid);
  const statsByRound: Record<string, StatLine>[] = [];
  const correctionsByRound: Record<string, number>[] = [];
  const histories: Record<string, HeldPlayer[][]> = Object.fromEntries(uids.map((id) => [id, []]));

  for (const round of locked) {
    const [scores, rosters, fixes] = await Promise.all([
      readScores(contestId, round.round),
      readAllRosters(contestId, uids, round.round),
      readCorrections(contestId, round.round).catch(() => ({})),
    ]);
    statsByRound.push(scores);
    correctionsByRound.push(
      Object.fromEntries(Object.entries(fixes).map(([playerId, fix]) => [playerId, fix.raw])),
    );
    for (const id of uids) histories[id]!.push(rosters[id] ?? []);
  }

  const entries: Entry[] = people.map((person) => ({
    entryId: person.uid,
    name: person.teamName,
    history: histories[person.uid]!,
  }));
  loaded.placings = table(entries, { statsByRound, correctionsByRound }, EASTSIDE);
  return loaded;
}
