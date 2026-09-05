import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import type { HeldPlayer } from '../domain/multiplier.ts';
import type { StatLine } from '../domain/scoring.ts';
import { db } from '../firebase.ts';

/**
 * Reading the contest as a signed-in manager.
 *
 * Every call here goes through the security rules, which is the point: if a manager could read
 * something he should not, this is where it would show, and the emulator would not save us because
 * the rules are the same ones deployed.
 */

export interface RoundConfig {
  round: number;
  name: string;
  seasonType: 'regular' | 'post';
  week: number;
  status: 'upcoming' | 'open' | 'locked' | 'final';
}

export interface Matchup {
  home: string;
  away: string;
  winner: string | null;
}

export interface Seeding {
  conference: string;
  seed: number;
}

export interface Contest {
  name: string;
  season: number;
  rounds: RoundConfig[];
  currentRound: number;
  status: string;
  commissioners: string[];
  field: Record<string, Seeding>;
  /** Firestore returns timestamps; kept as dates so a countdown needs no conversion. */
  locks: Record<string, Date>;
}

export interface RoundTeams {
  alive: string[];
  byes: string[];
  matchups: Matchup[];
}

export async function readContest(contestId: string): Promise<Contest | null> {
  const snapshot = await getDoc(doc(db, 'contests', contestId));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    ...data,
    locks: Object.fromEntries(
      Object.entries(data.locks ?? {}).map(([round, at]) => [round, (at as { toDate(): Date }).toDate()]),
    ),
  } as Contest;
}

export async function readTeams(contestId: string, round: number): Promise<RoundTeams | null> {
  const snapshot = await getDoc(doc(db, 'contests', contestId, 'teams', String(round)));
  return snapshot.exists() ? (snapshot.data() as RoundTeams) : null;
}

export interface PoolPlayer {
  id: string;
  name: string;
  position: string;
  team: string;
  form: number;
}

/** The whole board in a single read, rather than a query a phone pays for repeatedly. */
export async function readPool(contestId: string): Promise<PoolPlayer[]> {
  const snapshot = await getDoc(doc(db, 'contests', contestId, 'pool', 'current'));
  return snapshot.exists() ? ((snapshot.data().players ?? []) as PoolPlayer[]) : [];
}

/**
 * Every roster this manager has submitted, in round order.
 *
 * Read in full rather than round by round because the multiplier is a property of the history: what
 * a player is worth this week depends on every week before it.
 */
export async function readHistory(contestId: string, uid: string, upTo: number): Promise<HeldPlayer[][]> {
  const rounds = await Promise.all(
    Array.from({ length: upTo + 1 }, (_, round) => getDoc(doc(db, 'contests', contestId, 'entries', uid, 'rounds', String(round)))),
  );
  return rounds.map((snapshot) => (snapshot.exists() ? ((snapshot.data().players ?? []) as HeldPlayer[]) : []));
}

/**
 * Submitting a roster.
 *
 * The lock is not checked here. It is checked by the security rules against the server's clock,
 * because a check in this file runs on the manager's phone and believes whatever the phone says
 * the time is. A late write fails, and it fails at the database.
 */
export async function saveRoster(
  contestId: string,
  uid: string,
  round: number,
  players: HeldPlayer[],
): Promise<void> {
  await setDoc(doc(db, 'contests', contestId, 'entries', uid, 'rounds', String(round)), {
    players,
    submittedAt: serverTimestamp(),
  });
}

/** Who is in the league. Readable by any member, so the header can say how many are playing. */
export async function readEntries(contestId: string): Promise<{ uid: string; name: string }[]> {
  const snapshot = await getDocs(collection(db, 'contests', contestId, 'entries'));
  return snapshot.docs.map((entry) => ({ uid: entry.id, name: (entry.data().name as string) ?? entry.id }));
}

/**
 * A round's statistics as the scoring job left them.
 *
 * The raw total is stored alongside, but the table recomputes from the stat lines rather than
 * trusting it — same reason standings are derived rather than saved. If the two ever disagree, the
 * stat line is the truth and the stored figure is a stale cache.
 */
export async function readScores(contestId: string, round: number): Promise<Record<string, StatLine>> {
  const snapshot = await getDoc(doc(db, 'contests', contestId, 'scores', String(round)));
  if (!snapshot.exists()) return {};
  const players = (snapshot.data().players ?? {}) as Record<string, { raw: number; stats: StatLine }>;
  return Object.fromEntries(Object.entries(players).map(([id, entry]) => [id, entry.stats]));
}

/**
 * Everybody's roster for one round.
 *
 * Only ever called for rounds that have locked, because the rules refuse a manager another
 * manager's roster until then — which is the point of the rule, not an obstacle to it.
 */
export async function readAllRosters(
  contestId: string,
  uids: string[],
  round: number,
): Promise<Record<string, HeldPlayer[]>> {
  const docs = await Promise.all(
    uids.map((uid) => getDoc(doc(db, 'contests', contestId, 'entries', uid, 'rounds', String(round)))),
  );
  const rosters: Record<string, HeldPlayer[]> = {};
  uids.forEach((uid, index) => {
    const snapshot = docs[index]!;
    rosters[uid] = snapshot.exists() ? ((snapshot.data().players ?? []) as HeldPlayer[]) : [];
  });
  return rosters;
}
