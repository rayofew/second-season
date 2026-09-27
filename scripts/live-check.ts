/**
 * What the Live tab should be showing right now, worked out the same way it works it out.
 *
 * Not a test of the screen — a test of everything behind it: the feeds, the silencing, the
 * multipliers and the board. If this prints sense and the screen does not, the fault is in the
 * screen; if this prints nonsense, the screen was never going to be right.
 *
 *   node scripts/live-check.ts
 */
import { admin } from './admin.ts';
import { board } from '../src/domain/board.ts';
import type { BoardInput } from '../src/domain/board.ts';
import { liveRoster } from '../src/domain/live.ts';
import type { ClubState } from '../src/domain/live.ts';
import { standingsFor } from '../src/domain/multiplier.ts';
import type { HeldPlayer } from '../src/domain/multiplier.ts';
import { rawPoints, projectedPoints, points } from '../src/domain/scoring.ts';
import type { StatLine } from '../src/domain/scoring.ts';
import { silence } from '../src/domain/resting.ts';
import { EASTSIDE } from '../src/domain/rules.ts';
import type { Position } from '../src/domain/rules.ts';

const CONTEST = 'rehearsal-2026';
const db = admin();

const contest = (await db.doc(`contests/${CONTEST}`).get()).data()!;
const round = contest.currentRound as number;
const config = contest.rounds[round];

const [entries, teamsDoc, poolDoc] = await Promise.all([
  db.collection(`contests/${CONTEST}/entries`).get(),
  db.doc(`contests/${CONTEST}/teams/${round}`).get(),
  db.doc(`contests/${CONTEST}/pool/current`).get(),
]);

interface Player { id: string; name: string; position: string; team: string }
const pool = new Map(((poolDoc.data()?.players ?? []) as Player[]).map((p) => [p.id, p]));
const byes = new Set<string>(teamsDoc.data()?.byes ?? []);

const [scoreboard, real, guess] = await Promise.all([
  (await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${contest.season}&seasontype=2&week=${config.week}`)).json(),
  (await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${contest.season}/${config.week}`)).json() as Promise<Record<string, StatLine>>,
  (await fetch(`https://api.sleeper.app/v1/projections/nfl/regular/${contest.season}/${config.week}`)).json() as Promise<Record<string, StatLine>>,
]);

const STATES: Record<string, ClubState> = { pre: 'upcoming', in: 'playing', post: 'final' };
const stateOf = new Map<string, ClubState>();
for (const event of (scoreboard as { events?: { competitions?: { status?: { type?: { state?: string } }; competitors?: { team: { abbreviation: string } }[] }[] }[] }).events ?? []) {
  const competition = event.competitions?.[0];
  const state = STATES[competition?.status?.type?.state ?? 'pre'] ?? 'upcoming';
  for (const side of competition?.competitors ?? []) stateOf.set(side.team.abbreviation, state);
}

const clubOf = (id: string) => pool.get(id)?.team;
const scored = silence(real, clubOf, byes);
const guessed = silence(guess, clubOf, byes);

const inputs: BoardInput[] = [];
for (const entry of entries.docs) {
  const roster = ((await db.doc(`contests/${CONTEST}/entries/${entry.id}/rounds/${round}`).get())
    .data()?.players ?? []) as HeldPlayer[];
  const history = Array.from({ length: round + 1 }, () => [] as HeldPlayer[]);
  for (let past = 0; past <= round; past += 1) {
    history[past] = ((await db.doc(`contests/${CONTEST}/entries/${entry.id}/rounds/${past}`).get())
      .data()?.players ?? []) as HeldPlayer[];
  }
  const standing = new Map(standingsFor(history, round, EASTSIDE).map((held) => [held.slot, held.multiplier]));

  inputs.push({
    entryId: entry.id,
    name: (entry.data().teamName as string) || (entry.data().name as string),
    before: 0,
    players: liveRoster(roster.map((held) => {
      const person = pool.get(held.playerId);
      const state = person ? (stateOf.get(person.team) ?? 'upcoming') : 'final';
      return {
        playerId: held.playerId,
        slot: held.slot,
        multiplier: standing.get(held.slot) ?? 1,
        raw: rawPoints(held.position as Position, scored[held.playerId], EASTSIDE),
        projected: projectedPoints(held.position as Position, guessed[held.playerId], EASTSIDE),
        state,
      };
    })).players,
  });
}

const rows = board(inputs, 'week');
const playing = [...stateOf.values()].filter((s) => s === 'playing').length / 2;
const done = [...stateOf.values()].filter((s) => s === 'final').length / 2;

console.log(`${config.name} — NFL week ${config.week}: ${done} final, ${playing} in progress\n`);
console.log('THIS ROUND, raw points, as the leaderboard would have it:');
for (const row of rows) {
  console.log(
    `  ${String(row.rank).padStart(2)}. ${row.name.padEnd(14)} ${points(row.scored).padStart(7)} scored`
    + `  ${points(row.total).padStart(7)} running`
    + `   ${row.done} done · ${row.playing} playing · ${row.left} to come`,
  );
}
