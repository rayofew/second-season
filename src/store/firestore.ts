import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, limit, orderBy, query, setDoc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import type { HeldPlayer } from '../domain/multiplier.ts';
import type { StatLine } from '../domain/scoring.ts';
import type { ContestSettings } from '../domain/rules.ts';
import type { Prizes } from '../domain/pool.ts';
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
  /** Scoring, slots, the bye rule and tiebreakers, exactly as the engines read them. */
  settings: ContestSettings;
  season: number;
  rounds: RoundConfig[];
  currentRound: number;
  status: string;
  commissioners: string[];
  field: Record<string, Seeding>;
  /** Firestore returns timestamps; kept as dates so a countdown needs no conversion. */
  locks: Record<string, Date>;
  /** Buy-in, places, split and weekly prize. Missing means nobody is playing for anything. */
  prizes?: Prizes;
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

export interface Manager {
  uid: string;
  name: string;
  /** What they called their team. Falls back to their own name, so nobody is nameless in the table. */
  teamName: string;
  /** A small square, stored as a data URL because Cloud Storage needs the paid plan. */
  logo: string;
  /** Whether the commissioner has seen their money. Recorded here, settled between people. */
  paid: boolean;
}

/** Who is in the league. Readable by any member — but never their phone number, which stays on the application. */
export async function readEntries(contestId: string): Promise<Manager[]> {
  const snapshot = await getDocs(collection(db, 'contests', contestId, 'entries'));
  return snapshot.docs.map((entry) => {
    const data = entry.data();
    const name = (data.name as string) ?? entry.id;
    return {
      uid: entry.id,
      name,
      teamName: (data.teamName as string) || name,
      logo: (data.logo as string) ?? '',
      paid: Boolean(data.paid),
    };
  });
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

/** Every round's bracket at once. Rounds that have not been drawn yet come back null. */
export async function readAllTeams(contestId: string, rounds: number): Promise<(RoundTeams | null)[]> {
  const docs = await Promise.all(
    Array.from({ length: rounds }, (_, round) => getDoc(doc(db, 'contests', contestId, 'teams', String(round)))),
  );
  return docs.map((snapshot) => (snapshot.exists() ? (snapshot.data() as RoundTeams) : null));
}

export interface Application {
  uid: string;
  name: string;
  teamName: string;
  /** Only the commissioner and the applicant can read this. It never reaches an entry. */
  phone: string;
  logo: string;
}

/** Who has asked to join. Refused to anyone but the commissioner. */
export async function readApplications(contestId: string): Promise<Application[]> {
  const snapshot = await getDocs(collection(db, 'contests', contestId, 'applications'));
  return snapshot.docs.map((application) => {
    const data = application.data();
    const name = (data.name as string) ?? application.id;
    return {
      uid: application.id,
      name,
      teamName: (data.teamName as string) || name,
      phone: (data.phone as string) ?? '',
      logo: (data.logo as string) ?? '',
    };
  });
}

/**
 * Turning an application into a membership.
 *
 * The phone number is deliberately not copied. An entry is readable by the whole league, and a
 * number given to the commissioner was not given to everybody.
 */
export async function admitManager(contestId: string, application: Application): Promise<void> {
  await setDoc(doc(db, 'contests', contestId, 'entries', application.uid), {
    name: application.name,
    teamName: application.teamName,
    logo: application.logo,
    joinedAt: serverTimestamp(),
  });
}

/** Which managers have a roster in for a round. Used to know who still needs chasing. */
export async function readSubmitted(contestId: string, uids: string[], round: number): Promise<Set<string>> {
  const docs = await Promise.all(
    uids.map((uid) => getDoc(doc(db, 'contests', contestId, 'entries', uid, 'rounds', String(round)))),
  );
  const submitted = new Set<string>();
  uids.forEach((uid, index) => {
    const snapshot = docs[index]!;
    if (snapshot.exists() && ((snapshot.data().players as unknown[]) ?? []).length > 0) submitted.add(uid);
  });
  return submitted;
}

export interface Move {
  uid: string;
  round: number;
  /** 'in' and 'out' are the two halves of a swap; 'submitted' marks the roster being sent. */
  action: 'in' | 'out' | 'submitted';
  playerId: string;
  playerName: string;
  slot: string;
  at: Date;
}

/**
 * Recording what somebody did, in the order they did it.
 *
 * Append only, and written from the browser because only the browser knows a manager pressed
 * submit. The roster documents remain the authority on what was actually played; this is the story
 * of how it got that way, which the rosters alone cannot tell you — a man signed and dropped again
 * before the lock leaves no trace in them at all.
 */
export async function recordMoves(
  contestId: string,
  moves: Omit<Move, 'at'>[],
): Promise<void> {
  await Promise.all(
    moves.map((move) =>
      addDoc(collection(db, 'contests', contestId, 'log'), { ...move, at: serverTimestamp() }),
    ),
  );
}

/** Everything that has happened, newest first. Refused for rounds that have not locked. */
export async function readMoves(contestId: string): Promise<Move[]> {
  const snapshot = await getDocs(query(collection(db, 'contests', contestId, 'log'), orderBy('at', 'desc'), limit(300)));
  return snapshot.docs.map((entry) => {
    const data = entry.data();
    return { ...data, at: (data.at as { toDate(): Date } | null)?.toDate() ?? new Date() } as Move;
  });
}

/**
 * Turning somebody away.
 *
 * Deletes the application, which clears the list — it does not bar them, and they could fill the
 * form in again. Barring somebody would need a list of the barred, which is a lot of machinery for
 * a league where the commissioner knows everyone by name.
 */
export async function declineApplication(contestId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, 'contests', contestId, 'applications', uid));
}

/**
 * Taking a manager out of the league.
 *
 * Removes the entry, which is what membership is, so they lose their place immediately and fall
 * back to the join form. Their rosters are left where they are: Firestore does not delete a
 * subcollection with its parent, and a roster that has already been scored is part of the record.
 * If they are let back in, they find their old team waiting.
 */
export async function removeManager(contestId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, 'contests', contestId, 'entries', uid));
}

/**
 * Appointing or standing down a co-commissioner.
 *
 * The rules refuse any update that drops the owner from the list, so the man who set the contest up
 * keeps it whatever anybody presses. This function does not need to know that, and deliberately
 * does not check: a guard that lives only in the client is not a guard.
 */
export async function setCommissioners(contestId: string, commissioners: string[]): Promise<void> {
  await updateDoc(doc(db, 'contests', contestId), { commissioners });
}

/**
 * Finalising a round and opening the next.
 *
 * Three writes that belong together: the decided matchups, the next round's draw, and the contest
 * moving on. Firestore batches them, so a round cannot end up decided with nothing following it —
 * which on a Monday night, with one chance to get it right, is worth the extra few lines.
 */
export async function advanceRound(
  contestId: string,
  round: number,
  decided: { home: string; away: string; winner: string }[],
  through: string[],
  pairings: { home: string; away: string; winner: string | null }[],
): Promise<void> {
  const contestRef = doc(db, 'contests', contestId);
  const snapshot = await getDoc(contestRef);
  const rounds = (snapshot.data()?.rounds ?? []) as { round: number; status: string }[];
  const next = round + 1;
  const hasNext = rounds.some((entry) => entry.round === next);

  const batch = writeBatch(db);
  batch.update(doc(db, 'contests', contestId, 'teams', String(round)), { matchups: decided });
  if (hasNext) {
    batch.set(doc(db, 'contests', contestId, 'teams', String(next)), { alive: through, byes: [], matchups: pairings });
    batch.update(contestRef, {
      currentRound: next,
      rounds: rounds.map((entry) =>
        entry.round === round ? { ...entry, status: 'final' }
        : entry.round === next ? { ...entry, status: 'open' }
        : entry,
      ),
    });
  } else {
    batch.update(contestRef, { status: 'final' });
  }
  await batch.commit();
}

/** The whole prize arrangement. Nothing here handles money — it is a note of what was agreed. */
export async function setPrizes(contestId: string, prizes: Prizes): Promise<void> {
  await updateDoc(doc(db, 'contests', contestId), { prizes });
}

/** Ticking somebody off as having paid. A note in a ledger, not a transaction. */
export async function setPaid(contestId: string, uid: string, paid: boolean): Promise<void> {
  await updateDoc(doc(db, 'contests', contestId, 'entries', uid), { paid });
}

export interface Correction {
  raw: number;
  reason: string;
  by: string;
  at: Date;
}

/** What the commissioner has set by hand for a round, by player. */
export async function readCorrections(contestId: string, round: number): Promise<Record<string, Correction>> {
  const snapshot = await getDoc(doc(db, 'contests', contestId, 'corrections', String(round)));
  if (!snapshot.exists()) return {};
  const data = snapshot.data() as Record<string, { raw: number; reason: string; by: string; at?: { toDate(): Date } }>;
  return Object.fromEntries(
    Object.entries(data).map(([playerId, entry]) => [
      playerId,
      { ...entry, at: entry.at?.toDate() ?? new Date() },
    ]),
  );
}

/**
 * Setting a figure by hand, or taking the correction away again.
 *
 * A reason is required. A number somebody changed for a forgotten reason is worse than the number
 * they changed it from, and in February it is the only thing anybody will ask about.
 */
export async function setCorrection(
  contestId: string,
  round: number,
  playerId: string,
  correction: { raw: number; reason: string; by: string } | null,
): Promise<void> {
  const ref = doc(db, 'contests', contestId, 'corrections', String(round));
  await setDoc(
    ref,
    { [playerId]: correction ? { ...correction, at: new Date() } : deleteField() },
    { merge: true },
  );
}

/** The clubs and their seeds. Changing it changes who is favoured in every later draw. */
export async function setField(contestId: string, field: Record<string, Seeding>): Promise<void> {
  await updateDoc(doc(db, 'contests', contestId), { field });
}

/** Redrawing a round: who is in it, who rests, and who meets whom. */
export async function setRoundTeams(
  contestId: string,
  round: number,
  teams: { alive: string[]; byes: string[]; matchups: { home: string; away: string; winner: string | null }[] },
): Promise<void> {
  await setDoc(doc(db, 'contests', contestId, 'teams', String(round)), teams);
}
