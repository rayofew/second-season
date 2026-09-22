/**
 * The arithmetic, spelled out, so somebody who knows football can check it by eye.
 *
 * A total is either right or badly wrong and no amount of staring at "46.82" will say which. Opened
 * up — "394 passing yards ÷ 25 = 15.76" — anybody who watched the game can settle it in a second,
 * which matters because the people using this know football far better than the app does.
 *
 * Reads the round's stored scores and the same breakdown the app shows when somebody taps a number,
 * so what is printed here is what the contest actually used. Writes nothing.
 *
 *   node scripts/check-scoring.ts [round]           the best few at each position
 *   node scripts/check-scoring.ts [round] <name>    one player by name
 */
import { admin } from './admin.ts';
import { breakdown, breakdownTotal } from '../src/domain/breakdown.ts';
import { rawPoints } from '../src/domain/scoring.ts';
import { EASTSIDE } from '../src/domain/rules.ts';
import type { Position } from '../src/domain/rules.ts';
import type { StatLine } from '../src/domain/scoring.ts';

const CONTEST = 'rehearsal-2026';
const round = Number(process.argv[2] ?? 0);
const wanted = process.argv[3]?.toLowerCase();

const db = admin();
const [scores, poolDoc] = await Promise.all([
  db.doc(`contests/${CONTEST}/scores/${round}`).get(),
  db.doc(`contests/${CONTEST}/pool/current`).get(),
]);

if (!scores.exists) {
  console.log(`Round ${round} has never been scored.`);
  process.exit(1);
}

interface Player { id: string; name: string; position: string; team: string }
const pool = new Map(((poolDoc.data()?.players ?? []) as Player[]).map((player) => [player.id, player]));
const written = (scores.data()?.players ?? {}) as Record<string, { raw: number; stats: StatLine }>;

const rows = Object.entries(written)
  .map(([id, entry]) => ({ ...entry, who: pool.get(id) }))
  .filter((row): row is typeof row & { who: Player } => Boolean(row.who));

const chosen = wanted
  ? rows.filter((row) => row.who.name.toLowerCase().includes(wanted))
  // The highest scorer at each position, which is where an error would do the most damage.
  : ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].flatMap((position) =>
      rows.filter((row) => row.who.position === position)
        .sort((first, second) => second.raw - first.raw)
        .slice(0, 1));

if (chosen.length === 0) {
  console.log(wanted ? `Nobody matching "${wanted}".` : 'Nothing scored.');
  process.exit(1);
}

const money = (value: number) => value.toFixed(2).padStart(7);
let disagreements = 0;

for (const row of chosen) {
  const position = row.who.position as Position;
  console.log(`\n${row.who.name}  (${row.who.position} ${row.who.team})`);

  const lines = breakdown(position, row.stats);
  for (const line of lines) {
    console.log(`  ${line.label.padEnd(26)} ${line.detail.padEnd(22)} ${money(line.points)}`);
  }

  const shown = breakdownTotal(lines);
  const scored = rawPoints(position, row.stats, EASTSIDE);
  console.log(`  ${'='.repeat(26)} ${' '.repeat(22)} ${money(shown)}`);

  // Three figures that must agree: what the breakdown adds up to, what the scorer returns, and
  // what was actually written into the contest. Any gap between them is the bug worth finding.
  const agreed = Math.abs(shown - scored) < 0.005 && Math.abs(scored - row.raw) < 0.005;
  if (!agreed) {
    disagreements += 1;
    console.log(`  ** breakdown ${shown.toFixed(2)}, scorer ${scored.toFixed(2)}, stored ${row.raw.toFixed(2)}`);
  }
}

console.log(
  disagreements === 0
    ? '\nBreakdown, scorer and stored figure agree on every one.'
    : `\n${disagreements} disagree. That is a bug.`,
);
