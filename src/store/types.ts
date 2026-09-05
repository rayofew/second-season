import type { ContestSettings } from '../domain/rules.ts';
import type { HeldPlayer } from '../domain/multiplier.ts';
import type { StatLine } from '../domain/scoring.ts';

/**
 * What a contest looks like once it lives in a database rather than a JSON file.
 *
 * A roster is stored once per manager per round and never edited afterwards, so a multiplier can
 * always be recomputed from the history rather than inferred from whatever the roster happens to
 * say today. That is the difference between a standing you can audit and one you have to believe.
 */

export type RoundStatus = 'upcoming' | 'open' | 'locked' | 'final';

export interface RoundConfig {
  round: number;
  name: string;
  /**
   * Which real week this round scores. Configured rather than hardcoded so a rehearsal can run on
   * regular season weeks and January can run on the postseason with the same code.
   */
  seasonType: 'regular' | 'post';
  week: number;
  status: RoundStatus;
}

export interface Contest {
  id: string;
  name: string;
  season: number;
  settings: ContestSettings;
  rounds: RoundConfig[];
  currentRound: number;
  status: 'setup' | 'open' | 'final';
  /** Uids allowed to change settings and scores. */
  commissioners: string[];
  /**
   * When each round shuts, keyed by round number as a string.
   *
   * A map rather than a list because the security rules read it, and a rule can look up a key far
   * more simply than it can index into an array.
   */
  locks: Record<string, string>;
}

export interface ManagerEntry {
  /** The document id, which is the manager's Firebase uid. */
  uid: string;
  name: string;
  joinedAt: string;
}

export interface Store {
  contest(contestId: string): Promise<Contest | null>;
  entries(contestId: string): Promise<ManagerEntry[]>;
  roster(contestId: string, uid: string, round: number): Promise<HeldPlayer[] | null>;
  history(contestId: string, uid: string): Promise<HeldPlayer[][]>;
  saveRoster(contestId: string, uid: string, round: number, roster: HeldPlayer[]): Promise<void>;
  scores(contestId: string, round: number): Promise<Record<string, StatLine>>;
}
