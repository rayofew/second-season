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
import { points } from '../src/domain/scoring.ts';
import { scoreRound } from '../src/domain/scoreround.ts';
import type { Position } from '../src/domain/rules.ts';
import type { StatLine } from '../src/domain/scoring.ts';
import { admin } from './admin.ts';

// Which game: set GAME to run against another, e.g. $env:GAME = 'high-2027'. The rehearsal by default.
const CONTEST = process.env.GAME ?? 'rehearsal-2026';


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

// The same scoring the score-and-advance function on Firebase uses, from src/domain/scoreround.ts.
const { players, played, suppressed } = scoreRound(pool, stats, alive, resting, EASTSIDE);

console.log(`${config.name} — ${config.seasonType} ${season} week ${week}${dryRun ? '  (dry run)' : ''}`);
console.log(`scored: ${played}   suppressed (out or resting): ${suppressed}`);

if (!dryRun) {
  await db.doc(`contests/${CONTEST}/scores/${round}`).set({ round, week, season, updatedAt: new Date(), players });
  console.log('written to Firestore.');

  // The round's lineups in one document, so every page that draws a table reads one document
  // rather than one per manager. The commissioner's browser makes the same copy; doing it here as
  // well means a round is never left without one just because nobody opened Commish that week.
  const entries = await db.collection(`contests/${CONTEST}/entries`).listDocuments();
  const rosters: Record<string, unknown[]> = {};
  for (const entry of entries) {
    const snapshot = await entry.collection('rounds').doc(String(round)).get();
    rosters[entry.id] = snapshot.exists ? ((snapshot.data()?.players ?? []) as unknown[]) : [];
  }
  await db.doc(`contests/${CONTEST}/lineups/${round}`).set({ round, rosters, builtAt: new Date() });
  console.log(`lineups copied: ${entries.length} teams.`);
} else {
  console.log('nothing written: a dry run does not touch the contest.');
}

const nameOf = new Map(pool.map((p) => [p.id, `${p.name} (${p.position} ${p.team})`]));
console.log('');
for (const [id, entry] of Object.entries(players).sort((a, b) => b[1].raw - a[1].raw).slice(0, 8)) {
  console.log(`  ${(nameOf.get(id) ?? id).padEnd(34)} ${points(entry.raw)}`);
}
