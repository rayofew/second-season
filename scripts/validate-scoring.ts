/**
 * Checks our arithmetic against somebody else's.
 *
 * Sleeper computes its own full-PPR total for every player, which is a genuinely independent
 * calculation from the same statistics. For a receiver or a running back, Eastside scoring is full
 * PPR, so the two figures must agree exactly — any gap is a bug in our engine. Quarterbacks are
 * expected to differ, because Eastside pays six for a passing touchdown rather than four, and that
 * difference should be exactly the arithmetic and nothing else.
 *
 * Cheap to run against any completed week, and worth running whenever the scoring rules change.
 */
import { EASTSIDE } from '../src/domain/rules.ts';
import { rawPoints } from '../src/domain/scoring.ts';
import type { Position } from '../src/domain/rules.ts';
import type { StatLine } from '../src/domain/scoring.ts';

const season = Number(process.argv[2] ?? 2025);
const week = Number(process.argv[3] ?? 2);

const stats = (await (await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`)).json()) as Record<string, StatLine>;
const directory = (await (await fetch('https://api.sleeper.app/v1/players/nfl', { signal: AbortSignal.timeout(60_000) })).json()) as Record<string, { full_name?: string; position?: string }>;

interface Row { name: string; ours: number; theirs: number; diff: number; td: number; int: number }
const byPosition: Record<string, Row[]> = {};

for (const [id, line] of Object.entries(stats)) {
  const position = directory[id]?.position as Position | undefined;
  if (!position || !['QB', 'RB', 'WR', 'TE'].includes(position)) continue;
  if (!((line.pts_ppr ?? 0) > 3)) continue;

  const ours = rawPoints(position, line, EASTSIDE);
  (byPosition[position] ??= []).push({
    name: directory[id]?.full_name ?? id,
    ours,
    theirs: line.pts_ppr!,
    diff: ours - line.pts_ppr!,
    td: line.pass_td ?? 0,
    int: line.pass_int ?? 0,
  });
}

console.log(`${season} week ${week}\n`);
for (const position of ['WR', 'RB', 'TE', 'QB']) {
  const rows = byPosition[position] ?? [];
  const identical = rows.filter((row) => Math.abs(row.diff) < 0.05).length;
  const worst = rows.reduce((most, row) => (Math.abs(row.diff) > Math.abs(most.diff) ? row : most), rows[0]!);
  console.log(
    `${position}: ${String(rows.length).padStart(3)} players | identical to Sleeper: ${String(identical).padStart(3)}` +
      ` | largest gap ${worst.diff.toFixed(1)} (${worst.name})`,
  );
}

console.log('\nquarterbacks, where the rules genuinely differ:');
for (const row of (byPosition.QB ?? []).sort((a, b) => b.ours - a.ours).slice(0, 4)) {
  const expected = row.td * 2 + row.int * -1;
  const ok = Math.abs(row.diff - expected) < 0.05 ? 'as expected' : `UNEXPLAINED (expected +${expected})`;
  console.log(`  ${row.name.padEnd(20)} ours ${row.ours.toFixed(1)}  sleeper ${row.theirs.toFixed(1)}  diff ${row.diff.toFixed(1)}  ${row.td}TD ${row.int}INT — ${ok}`);
}
