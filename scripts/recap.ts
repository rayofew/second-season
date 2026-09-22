/**
 * The round in numbers, for writing up.
 *
 * Everything a summary needs and nothing a screen already says better: who won the week, what the
 * table looks like, and the handful of afternoons worth mentioning by name. Read only, and it uses
 * the same table() that settles the contest, so nothing here can disagree with the standings.
 *
 *   node scripts/recap.ts [round]
 */
import { admin } from './admin.ts';
import { table } from '../src/domain/standings.ts';
import type { Entry } from '../src/domain/standings.ts';
import { weeklyWins } from '../src/domain/weekly.ts';
import { EASTSIDE } from '../src/domain/rules.ts';
import type { HeldPlayer } from '../src/domain/multiplier.ts';
import type { StatLine } from '../src/domain/scoring.ts';

const CONTEST = 'rehearsal-2026';
const upTo = Number(process.argv[2] ?? 0);
const db = admin();

const contest = (await db.doc(`contests/${CONTEST}`).get()).data()!;
const entries = await db.collection(`contests/${CONTEST}/entries`).get();
const pool = new Map((((await db.doc(`contests/${CONTEST}/pool/current`).get()).data()?.players ?? []) as
  { id: string; name: string; position: string; team: string }[]).map((p) => [p.id, p]));

const statsByRound: Record<string, StatLine>[] = [];
const histories: Record<string, HeldPlayer[][]> = Object.fromEntries(entries.docs.map((e) => [e.id, []]));

for (let round = 0; round <= upTo; round += 1) {
  const scores = (await db.doc(`contests/${CONTEST}/scores/${round}`).get()).data()?.players ?? {};
  statsByRound.push(Object.fromEntries(Object.entries(scores as Record<string, { stats: StatLine }>)
    .map(([id, entry]) => [id, entry.stats])));
  for (const entry of entries.docs) {
    const roster = await db.doc(`contests/${CONTEST}/entries/${entry.id}/rounds/${round}`).get();
    histories[entry.id]!.push((roster.data()?.players ?? []) as HeldPlayer[]);
  }
}

const teamOf = new Map(entries.docs.map((e) => [e.id, (e.data().teamName as string) || (e.data().name as string)]));
const board: Entry[] = entries.docs.map((entry) => ({
  entryId: entry.id, name: teamOf.get(entry.id)!, history: histories[entry.id]!,
}));

const placings = table(board, { statsByRound }, EASTSIDE);
const weeks = weeklyWins(placings);
const week = weeks[upTo]!;
const config = contest.rounds[upTo];
const weekly = contest.prizes?.weekly ?? 0;

const n = (value: number) => value.toFixed(2);

console.log(`=== ${config.name} — NFL week ${config.week} ===\n`);
console.log(`WEEKLY PRIZE ($${weekly}): ${week.winners.map((w) => w.name).join(' and ')} — ${n(week.raw)} raw`);

console.log('\nTHIS ROUND, raw points (the weekly race):');
[...placings]
  .map((p) => ({ name: p.name, raw: p.rounds[upTo]?.raw ?? 0 }))
  .sort((a, b) => b.raw - a.raw)
  .forEach((row, index) => console.log(`  ${String(index + 1).padStart(2)}. ${row.name.padEnd(16)} ${n(row.raw).padStart(7)}`));

console.log('\nOVERALL, credited points (the contest):');
placings.forEach((p) => console.log(
  `  ${String(p.rank).padStart(2)}. ${p.name.padEnd(16)} ${n(p.credited).padStart(7)}`,
));

// The individual afternoons worth naming, counted once each however many people held the man.
const best = new Map<string, { name: string; club: string; raw: number; held: string[] }>();
for (const placing of placings) {
  for (const player of placing.rounds[upTo]?.players ?? []) {
    const who = pool.get(player.playerId);
    if (!who || player.raw <= 0) continue;
    const found = best.get(player.playerId) ?? { name: who.name, club: who.team, raw: player.raw, held: [] };
    found.held.push(placing.name);
    best.set(player.playerId, found);
  }
}
console.log('\nBEST AFTERNOONS (and who had them):');
[...best.values()].sort((a, b) => b.raw - a.raw).slice(0, 8).forEach((player) => console.log(
  `  ${player.name.padEnd(22)} ${player.club.padEnd(4)} ${n(player.raw).padStart(6)}   ${player.held.length} held: ${player.held.join(', ')}`,
));
