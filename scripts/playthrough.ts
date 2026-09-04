/**
 * Plays a whole contest through a real postseason and prints what happened.
 *
 * Not a test — a rehearsal. The engines are already proven against fixtures; what this answers is
 * whether the game is any good: do the multipliers separate people, or does everyone finish within
 * three points of each other?
 *
 * Nothing here uses hindsight. Managers rank players by what they did in the regular season, which
 * is all anyone knows in January, and replace an eliminated man with the best available survivor by
 * that same measure. The bracket is read from the data rather than hardcoded.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { EASTSIDE } from '../src/domain/rules.ts';
import { display, rawPoints } from '../src/domain/scoring.ts';
import { creditedPoints, standingsFor } from '../src/domain/multiplier.ts';
import type { HeldPlayer, RoundRoster } from '../src/domain/multiplier.ts';
import { directory, seasonTotals, stats, teamsPlaying } from '../src/providers/sleeper.ts';
import type { SleeperPlayer } from '../src/providers/sleeper.ts';
import type { StatLine } from '../src/domain/scoring.ts';

const SEASON = 2024;
const ROUND_NAMES = ['Wild Card', 'Divisional', 'Conference', 'Super Bowl'];

/** Sleeper's player list is several megabytes; fetching it once is plenty. */
async function cached<T>(name: string, fetcher: () => Promise<T>): Promise<T> {
  mkdirSync('.cache', { recursive: true });
  const path = `.cache/${name}.json`;
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as T;
  const value = await fetcher();
  writeFileSync(path, JSON.stringify(value));
  return value;
}

interface Ranked extends SleeperPlayer {
  /** Eastside points per game across the regular season: what a manager would rank on. */
  form: number;
}

type Strategy = (player: Ranked, byeTeams: Set<string>) => number;

const MANAGERS: { name: string; pick: Strategy; onePerTeam?: boolean }[] = [
  { name: 'Chalk', pick: (p) => p.form },
  { name: 'Bye Hunter', pick: (p, byes) => p.form + (p.team && byes.has(p.team) ? 6 : 0) },
  { name: 'Spread', pick: (p) => p.form, onePerTeam: true },
  { name: 'Chiefs Stack', pick: (p) => p.form + (p.team === 'KC' ? 8 : 0) },
  { name: 'Ravens Stack', pick: (p) => p.form + (p.team === 'BAL' ? 8 : 0) },
];

function pickRoster(
  manager: (typeof MANAGERS)[number],
  pool: Ranked[],
  alive: Set<string>,
  byeTeams: Set<string>,
  keep: HeldPlayer[] = [],
): HeldPlayer[] {
  const roster = [...keep];
  const taken = new Set(roster.map((held) => held.playerId));
  const usedTeams = new Set(roster.map((held) => pool.find((p) => p.id === held.playerId)?.team));

  for (const slot of EASTSIDE.slots) {
    if (roster.some((held) => held.slot === slot.id)) continue;

    const candidate = pool
      .filter((p) => slot.eligible.includes(p.position) && !taken.has(p.id) && p.team && alive.has(p.team))
      .filter((p) => !(manager.onePerTeam && usedTeams.has(p.team)))
      .sort((a, b) => manager.pick(b, byeTeams) - manager.pick(a, byeTeams))[0];
    if (!candidate) continue;

    taken.add(candidate.id);
    usedTeams.add(candidate.team);
    roster.push({
      playerId: candidate.id,
      position: candidate.position,
      slot: slot.id,
      onBye: candidate.team ? byeTeams.has(candidate.team) : false,
    });
  }

  return roster;
}

const players = await cached('directory', async () => [...(await directory()).values()]);
const totals = await cached('totals', () => seasonTotals(SEASON));
const rounds: Record<string, StatLine>[] = [];
for (let round = 1; round <= 4; round += 1) {
  rounds.push(await cached(`post-${SEASON}-${round}`, () => stats(SEASON, 'post', round)));
}

const alive = rounds.map((round) => teamsPlaying(round));
const byeTeams = new Set([...alive[1]!].filter((team) => !alive[0]!.has(team)));
const field = new Set([...alive[0]!, ...byeTeams]);

const pool: Ranked[] = players
  .filter((p) => p.team && field.has(p.team))
  .map((p) => {
    const line = totals[p.id];
    const games = Math.max(line?.gp ?? 1, 1);
    return { ...p, form: line ? rawPoints(p.position, line) / games : 0 };
  })
  .filter((p) => p.form > 0);

console.log(`\n${SEASON} postseason — ${field.size} teams, ${pool.length} rostered players in the pool`);
console.log(`Byes: ${[...byeTeams].join(', ')}`);
alive.forEach((teams, index) => console.log(`  ${ROUND_NAMES[index]!.padEnd(12)} ${[...teams].sort().join(' ')}`));

const histories = new Map<string, RoundRoster[]>(MANAGERS.map((m) => [m.name, []]));
const totalsByManager = new Map<string, number>(MANAGERS.map((m) => [m.name, 0]));
const byRound = new Map<string, number[]>(MANAGERS.map((m) => [m.name, []]));

for (let round = 0; round < 4; round += 1) {
  const playing = alive[round]!;

  for (const manager of MANAGERS) {
    const history = histories.get(manager.name)!;
    const previous = history[round - 1] ?? [];
    // Anyone whose club is out is dropped; everyone else carries over untouched.
    const survivors = previous.filter((held) => {
      const team = pool.find((p) => p.id === held.playerId)?.team;
      return team && playing.has(team);
    });
    history.push(pickRoster(manager, pool, playing, round === 0 ? byeTeams : new Set(), survivors));

    let scored = 0;
    for (const standing of standingsFor(history, round, EASTSIDE)) {
      const raw = rawPoints(standing.position, rounds[round]![standing.playerId]);
      scored += creditedPoints(raw, standing.multiplier);
    }
    byRound.get(manager.name)!.push(scored);
    totalsByManager.set(manager.name, totalsByManager.get(manager.name)! + scored);
  }
}

console.log(`\n${'Manager'.padEnd(14)}${ROUND_NAMES.map((n) => n.padStart(12)).join('')}${'TOTAL'.padStart(12)}`);
const table = [...totalsByManager.entries()].sort((a, b) => b[1] - a[1]);
for (const [name, total] of table) {
  const cells = byRound.get(name)!.map((points) => display(points, EASTSIDE).toFixed(1).padStart(12)).join('');
  console.log(`${name.padEnd(14)}${cells}${display(total, EASTSIDE).toFixed(1).padStart(12)}`);
}

const [champion] = table[0]!;
console.log(`\n${champion} in the Super Bowl round:`);
const finalRoster = standingsFor(histories.get(champion)!, 3, EASTSIDE);
for (const standing of finalRoster.sort((a, b) => b.multiplier - a.multiplier)) {
  const who = pool.find((p) => p.id === standing.playerId)!;
  const raw = rawPoints(standing.position, rounds[3]![standing.playerId]);
  console.log(
    `  ${standing.slot.padEnd(5)} ${who.name.padEnd(22)} ${(who.team ?? '').padEnd(4)}` +
      `${standing.multiplier}x  ${display(raw).toFixed(1).padStart(6)} raw  ->${display(creditedPoints(raw, standing.multiplier)).toFixed(1).padStart(7)}`,
  );
}
