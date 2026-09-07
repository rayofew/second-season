/**
 * Pulls a round's statistics, works out what everybody scored, and writes it down.
 *
 * The one rule worth stating: a player whose club is out, or resting, gets no entry at all — not a
 * row of noughts. That is exactly what real postseason data looks like, where a knocked-out player
 * simply has no line, and it means the scoring engine needs no notion of elimination. The
 * suppression lives here, at the edge, and January will not use it because reality does the same
 * job unaided.
 *
 * Run it as often as you like. It overwrites, so a restated statistic is one more run.
 *
 *   node scripts/score.ts [round] [season] [week]
 *
 * Season and week override the round's own configuration, which is how a past week gets scored for
 * a dry run before the season has started.
 */
import { EASTSIDE } from '../src/domain/rules.ts';
import { points, rawPoints } from '../src/domain/scoring.ts';
import type { Position } from '../src/domain/rules.ts';
import type { StatLine } from '../src/domain/scoring.ts';
import { admin } from './admin.ts';

const CONTEST = 'rehearsal-2026';

/** The fields that decide a score, kept so the arithmetic can be checked on screen. */
const SHOWN = [
  'pass_yd', 'pass_td', 'pass_int', 'pass_2pt',
  'rush_yd', 'rush_td', 'rush_2pt',
  'rec', 'rec_yd', 'rec_td', 'rec_2pt', 'fum_lost',
  'xpm', 'fgm', 'fgm_0_19', 'fgm_20_29', 'fgm_30_39', 'fgm_40_49', 'fgm_50_59', 'fgm_50p', 'fgm_60p',
  'sack', 'int', 'fum_rec', 'safe', 'blk_kick', 'def_td', 'def_st_td', 'pts_allow', 'def_kr_yd', 'def_pr_yd',
];

const db = admin();
const contest = (await db.doc(`contests/${CONTEST}`).get()).data();
if (!contest) throw new Error('No contest');

const round = Number(process.argv[2] ?? contest.currentRound);
const config = contest.rounds[round];
if (!config) throw new Error(`No round ${round}`);

const season = Number(process.argv[3] ?? contest.season);
const week = Number(process.argv[4] ?? config.week);
const dryRun = season !== contest.season || week !== config.week;

const teams = (await db.doc(`contests/${CONTEST}/teams/${round}`).get()).data();
const pool = ((await db.doc(`contests/${CONTEST}/pool/current`).get()).data()?.players ?? []) as
  { id: string; name: string; position: Position; team: string }[];

const alive = new Set<string>(teams?.alive ?? []);
const resting = new Set<string>(teams?.byes ?? []);

const url = `https://api.sleeper.app/v1/stats/nfl/${config.seasonType}/${season}/${week}`;
const stats = (await (await fetch(url, { signal: AbortSignal.timeout(30_000) })).json()) as Record<string, StatLine>;

const players: Record<string, { raw: number; stats: Record<string, number> }> = {};
let played = 0;
let suppressed = 0;

for (const player of pool) {
  // Out of the bracket, or resting this round: no line, exactly as a real postseason would give us.
  if (!alive.has(player.team) || resting.has(player.team)) { suppressed += 1; continue; }

  const line = stats[player.id];
  if (!line) continue;

  const shown: Record<string, number> = {};
  for (const field of SHOWN) if (line[field]) shown[field] = line[field]!;
  players[player.id] = { raw: rawPoints(player.position, line, EASTSIDE), stats: shown };
  played += 1;
}

console.log(`${config.name} — ${config.seasonType} ${season} week ${week}${dryRun ? '  (dry run)' : ''}`);
console.log(`scored: ${played}   suppressed (out or resting): ${suppressed}`);

if (!dryRun) {
  await db.doc(`contests/${CONTEST}/scores/${round}`).set({ round, week, season, updatedAt: new Date(), players });
  console.log('written to Firestore.');
} else {
  console.log('nothing written: a dry run does not touch the contest.');
}

const nameOf = new Map(pool.map((p) => [p.id, `${p.name} (${p.position} ${p.team})`]));
console.log('');
for (const [id, entry] of Object.entries(players).sort((a, b) => b[1].raw - a[1].raw).slice(0, 8)) {
  console.log(`  ${(nameOf.get(id) ?? id).padEnd(34)} ${points(entry.raw)}`);
}
