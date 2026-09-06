import type { Position } from '../domain/rules.ts';
import type { StatLine } from '../domain/scoring.ts';

/**
 * Sleeper, which is the only free source that scores the postseason.
 *
 * Kept to plain fetch with no caching and no Node imports, because a browser calls this directly
 * during games: Sleeper answers cross-origin requests, so the live view needs no server of its own.
 * Anything that wants to keep a copy on disk can wrap it.
 *
 * A player who did not play has no entry at all — not a row of noughts. Elimination and byes are
 * therefore an absence rather than a state, which is why neither needs handling downstream.
 */

const BASE = 'https://api.sleeper.app/v1';

export type SeasonType = 'regular' | 'post' | 'pre';

export interface SleeperPlayer {
  id: string;
  name: string;
  position: Position;
  team: string | null;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}/${path}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Sleeper answered ${response.status} for ${path}`);
  return (await response.json()) as T;
}

/** Stat lines for one scoring period, by player id. Team defenses are keyed by abbreviation. */
export async function stats(season: number, type: SeasonType, week: number): Promise<Record<string, StatLine>> {
  return get(`stats/nfl/${type}/${season}/${week}`);
}

/** Whole-season totals, useful for ranking players by what they did before the postseason began. */
export async function seasonTotals(season: number, type: SeasonType = 'regular'): Promise<Record<string, StatLine>> {
  return get(`stats/nfl/${type}/${season}`);
}

const POSITIONS = new Set<Position>(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

/** Every player Sleeper knows, reduced to the four things this game needs. */
export async function directory(): Promise<Map<string, SleeperPlayer>> {
  const raw = await get<Record<string, { full_name?: string; last_name?: string; position?: string; team?: string | null }>>(
    'players/nfl',
  );
  const players = new Map<string, SleeperPlayer>();

  for (const [id, entry] of Object.entries(raw)) {
    const position = entry.position as Position | undefined;
    if (!position || !POSITIONS.has(position)) continue;
    players.set(id, {
      id,
      name: entry.full_name ?? entry.last_name ?? id,
      position,
      // A team defense is its own club, and Sleeper leaves the field empty for them.
      team: position === 'DEF' ? id : (entry.team ?? null),
    });
  }

  return players;
}

/**
 * Which clubs took the field in a round, read from who has a defense in the data.
 *
 * The bracket is not published anywhere free, but it does not need to be: a team that played has a
 * stat line and a team that did not has nothing. Wild Card weekend returns twelve clubs, and the
 * two missing from a fourteen team field are the ones resting.
 */
export function teamsPlaying(roundStats: Record<string, StatLine>): Set<string> {
  return new Set(Object.keys(roundStats).filter((key) => /^[A-Z]{2,3}$/.test(key)));
}
