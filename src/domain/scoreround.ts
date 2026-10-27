import { EASTSIDE } from './rules.ts';
import type { ContestSettings, Position } from './rules.ts';
import { rawPoints } from './scoring.ts';
import type { StatLine } from './scoring.ts';

/**
 * A round's scores, from its stat lines: what gets written to scores/{round}.
 *
 * One function for every place that scores a round — scripts/score.ts on a machine holding the key,
 * and the score-and-advance function on Firebase — so the two cannot disagree about anybody's
 * points.
 *
 * The one rule worth stating: a player whose club is out, or resting, gets no entry at all — not a
 * row of noughts. That is exactly what real postseason data looks like, where a knocked-out player
 * simply has no line, so the scoring engine needs no notion of elimination.
 */

/** The fields that decide a score, kept so the arithmetic can be checked on screen. */
export const SHOWN = [
  'pass_yd', 'pass_td', 'pass_int', 'pass_2pt',
  'rush_yd', 'rush_td', 'rush_2pt',
  'rec', 'rec_yd', 'rec_td', 'rec_2pt', 'fum_lost',
  'xpm', 'fgm', 'fgm_0_19', 'fgm_20_29', 'fgm_30_39', 'fgm_40_49', 'fgm_50_59', 'fgm_50p', 'fgm_60p',
  'sack', 'int', 'fum_rec', 'safe', 'blk_kick', 'def_td', 'def_st_td', 'pts_allow', 'def_kr_yd', 'def_pr_yd',
];

export interface PoolEntry { id: string; name: string; position: Position; team: string }

export interface RoundScores {
  players: Record<string, { raw: number; stats: Record<string, number> }>;
  played: number;
  suppressed: number;
}

export function scoreRound(
  pool: readonly PoolEntry[],
  stats: Readonly<Record<string, StatLine>>,
  alive: ReadonlySet<string>,
  resting: ReadonlySet<string>,
  settings: ContestSettings = EASTSIDE,
): RoundScores {
  const players: RoundScores['players'] = {};
  let played = 0;
  let suppressed = 0;
  for (const player of pool) {
    if (!alive.has(player.team) || resting.has(player.team)) { suppressed += 1; continue; }
    const line = stats[player.id];
    if (!line) continue;
    const shown: Record<string, number> = {};
    for (const field of SHOWN) if (line[field]) shown[field] = line[field]!;
    players[player.id] = { raw: rawPoints(player.position, line, settings), stats: shown };
    played += 1;
  }
  return { players, played, suppressed };
}

/**
 * Who carries a team into this round without having pressed submit: last round's survivors, in the
 * same slots, with anybody whose club went out left as an empty slot. Somebody who has never
 * submitted anything has nothing to carry. Same rule as scripts/carry-over.ts.
 */
export function carriedTeam<T extends { playerId: string; onBye?: boolean }>(
  last: readonly T[],
  clubOf: (playerId: string) => string | undefined,
  alive: ReadonlySet<string>,
  resting: ReadonlySet<string>,
): (T & { onBye: boolean })[] {
  return last
    .filter((held) => alive.has(clubOf(held.playerId) ?? ''))
    .map((held) => ({ ...held, onBye: resting.has(clubOf(held.playerId) ?? '') }));
}
