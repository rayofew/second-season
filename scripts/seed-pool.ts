/**
 * The players a manager may choose between, written once so a phone never downloads Sleeper's
 * whole directory — which is several megabytes and mostly people who will never take a snap.
 *
 * Ranked by last season's points per game, because that is the only form guide anyone has in week
 * two and it is what a manager would reach for anyway.
 */
import { EASTSIDE } from '../src/domain/rules.ts';
import { rawPoints } from '../src/domain/scoring.ts';
import type { Position } from '../src/domain/rules.ts';
import { admin } from './admin.ts';

const CONTEST = 'rehearsal-2026';
const FIELD = ['DEN', 'NE', 'JAX', 'PIT', 'BUF', 'HOU', 'LAC', 'SEA', 'PHI', 'CHI', 'TB', 'LAR', 'SF', 'GB'];
const WANTED = new Set<Position>(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

interface Entry {
  full_name?: string;
  last_name?: string;
  position?: string;
  team?: string | null;
  status?: string;
}

const clubs = new Set(FIELD);
const directory = (await (await fetch('https://api.sleeper.app/v1/players/nfl', { signal: AbortSignal.timeout(60_000) })).json()) as Record<string, Entry>;
const form = (await (await fetch('https://api.sleeper.app/v1/stats/nfl/regular/2025')).json()) as Record<string, Record<string, number>>;

const pool = [];
for (const [id, entry] of Object.entries(directory)) {
  const position = entry.position as Position | undefined;
  if (!position || !WANTED.has(position)) continue;
  // A defence is its own club and Sleeper leaves its team field empty.
  const team = position === 'DEF' ? id : entry.team;
  if (!team || !clubs.has(team)) continue;

  const line = form[id];
  const games = Math.max(line?.gp ?? 0, 1);
  pool.push({
    id,
    name: entry.full_name ?? entry.last_name ?? id,
    position,
    team,
    form: line ? Math.round((rawPoints(position, line, EASTSIDE) / games) * 10) / 10 : 0,
  });
}

pool.sort((a, b) => b.form - a.form);

const db = admin();
await db.doc(`contests/${CONTEST}/pool/current`).set({ updatedAt: new Date(), players: pool });

const byPosition: Record<string, number> = {};
for (const p of pool) byPosition[p.position] = (byPosition[p.position] ?? 0) + 1;
console.log(`${pool.length} players across ${FIELD.length} clubs`);
console.log(Object.entries(byPosition).map(([k, v]) => `${k}:${v}`).join('  '));
console.log('\ntop of the board:');
for (const p of pool.slice(0, 6)) console.log(`  ${p.name.padEnd(22)} ${p.position.padEnd(4)} ${p.team.padEnd(4)} ${p.form}`);
