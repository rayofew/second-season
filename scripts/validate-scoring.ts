/**
 * Checks our scoring against the league's own platform.
 *
 * Fleaflicker is where Eastside has actually been played for years, so it is the authority on what
 * a performance is worth — not a rulebook, and not another provider's idea of PPR. Every figure it
 * shows should be the figure we produce.
 *
 * This is what found the yardage rule: our numbers carried fractions and theirs never did, because
 * yards pay whole points one at a time and the fraction is never created. Worth running against any
 * completed week whenever the scoring changes.
 *
 *   node scripts/validate-scoring.ts 2025 18
 */
import { EASTSIDE } from '../src/domain/rules.ts';
import { rawPoints } from '../src/domain/scoring.ts';
import type { Position } from '../src/domain/rules.ts';
import type { StatLine } from '../src/domain/scoring.ts';

const season = Number(process.argv[2] ?? 2025);
const week = Number(process.argv[3] ?? 18);

const roster = await (await fetch(
  `https://www.fleaflicker.com/api/FetchRoster?sport=NFL&league_id=34632&team_id=710483&season=${season}&scoring_period=${week}`,
)).json();

interface Slot { leaguePlayer?: { proPlayer?: { nameFull?: string }; viewingActualPoints?: { value?: number } } }
const theirs = ((roster.groups ?? []) as { slots?: Slot[] }[])
  .flatMap((group) => group.slots ?? [])
  .map((slot) => slot.leaguePlayer)
  .filter((player) => player?.viewingActualPoints?.value != null)
  .map((player) => ({ name: player!.proPlayer?.nameFull ?? '', points: player!.viewingActualPoints!.value! }));

const directory = (await (await fetch('https://api.sleeper.app/v1/players/nfl', { signal: AbortSignal.timeout(60_000) })).json()) as
  Record<string, { full_name?: string; position?: string }>;
const stats = (await (await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`)).json()) as Record<string, StatLine>;

const norm = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '');
const byName = new Map(Object.entries(directory).map(([id, player]) => [norm(player.full_name ?? ''), { id, position: player.position }]));

console.log('player               theirs     ours');
let rounds = 0;
let compared = 0;

for (const entry of theirs) {
  const found = byName.get(norm(entry.name));
  const position = (found?.position ?? (entry.name.length <= 12 ? 'DEF' : undefined)) as Position | undefined;
  const id = found?.id;
  if (!id || !position) { console.log(`${entry.name.padEnd(20)} ${String(entry.points).padStart(6)}   (no match)`); continue; }

  const ours = rawPoints(position, stats[id], EASTSIDE);
  compared += 1;
  if (Math.abs(ours - entry.points) < 1e-9) rounds += 1;
  const agrees = Math.abs(ours - entry.points) < 1e-9;
  console.log(
    `${entry.name.padEnd(20)} ${String(entry.points).padStart(6)} ${ours.toFixed(2).padStart(8)}` +
      `  ${agrees ? 'agrees' : 'DISAGREES'}`,
  );
}

console.log(`
${rounds} of ${compared} agree with the league's own platform.`);
