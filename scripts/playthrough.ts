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
import { points, rawPoints } from '../src/domain/scoring.ts';
import { table } from '../src/domain/standings.ts';
import type { Entry } from '../src/domain/standings.ts';
import type { HeldPlayer } from '../src/domain/multiplier.ts';
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

// Rosters are carried forward round by round, patched only where a club went out. Building the
// whole history first means the contest is scored by the same table() the app renders.
const histories = new Map<string, HeldPlayer[][]>(MANAGERS.map((m) => [m.name, []]));

for (let round = 0; round < 4; round += 1) {
    const playing = alive[round]!;
  // A resting club is eligible in Wild Card even though it does not play: that is the bye rule, and
  // excluding them would quietly make it untestable.
  const eligible = round === 0 ? field : playing;
  for (const manager of MANAGERS) {
    const history = histories.get(manager.name)!;
    const survivors = (history[round - 1] ?? []).filter((held) => {
      const team = pool.find((p) => p.id === held.playerId)?.team;
      return team && playing.has(team);
    });
    history.push(pickRoster(manager, pool, eligible, round === 0 ? byeTeams : new Set(), survivors));
  }
}

const entries: Entry[] = MANAGERS.map((manager, index) => ({
  entryId: manager.name,
  name: manager.name,
  history: histories.get(manager.name)!,
  // Super Bowl LIX finished 40-22. Guesses either side of it, to exercise the tiebreaker.
  prediction: [44, 51, 62, 47, 55][index],
}));

const placings = table(entries, { statsByRound: rounds, superBowlTotal: 62 }, EASTSIDE);

console.log(`\n${'Manager'.padEnd(14)}${ROUND_NAMES.map((n) => n.padStart(12)).join('')}${'TOTAL'.padStart(12)}`);
for (const placing of placings) {
  const cells = placing.rounds.map((round) => points(round.credited).padStart(12)).join('');
  console.log(`${placing.name.padEnd(14)}${cells}${points(placing.credited).padStart(12)}`);
}

const champion = placings[0]!;
console.log(`\n${champion.name} in the Super Bowl round:`);
for (const player of [...champion.rounds[3]!.players].sort((a, b) => b.multiplier - a.multiplier)) {
  const who = pool.find((p) => p.id === player.playerId)!;
  console.log(
    `  ${player.slot.padEnd(5)} ${who.name.padEnd(22)} ${(who.team ?? '').padEnd(4)}${player.multiplier}x  ` +
      `${points(player.raw).padStart(6)} raw  ->${points(player.credited).padStart(7)}`,
  );
}

// A snapshot the app can render without a network or a cache, so the screens have real data from
// the first commit rather than something invented to look plausible.
const rostered = new Set(placings.flatMap((p) => p.rounds.flatMap((r) => r.players.map((x) => x.playerId))));
const snapshot = {
  season: SEASON,
  roundNames: ROUND_NAMES,
  byeTeams: [...byeTeams],
  teamsByRound: alive.map((teams) => [...teams].sort()),
  players: Object.fromEntries(
    [...rostered].map((id) => {
      const who = pool.find((p) => p.id === id)!;
      return [id, { name: who.name, team: who.team, position: who.position }];
    }),
  ),
  placings,
  // The whole eligible field, so the roster builder has real people to choose between rather than
  // the handful these five managers happened to pick.
  pool: pool
    .filter((p) => p.form > 0.5)
    .sort((a, b) => b.form - a.form)
    .map((p) => ({ id: p.id, name: p.name, team: p.team, position: p.position, form: Math.round(p.form * 10) / 10 })),
  // One manager's Wild Card roster, so the builder can open on the Divisional round with survivors
  // carried over and eliminated men needing replacing — which is the screen doing its real work.
  seedRoster: histories.get('Chalk')![0],
};
mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/playthrough-2024.json', JSON.stringify(snapshot, null, 2));
console.log(`\nWrote src/data/playthrough-2024.json (${rostered.size} players)`);
