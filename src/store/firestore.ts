import { doc, getDoc } from 'firebase/firestore';
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
