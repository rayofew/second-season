/** How each tie in a round was actually settled, with the real fixtures behind it. */
import { admin } from './admin.ts';
import { decide } from '../src/domain/advance.ts';
import type { Field } from '../src/domain/advance.ts';

const CONTEST = 'rehearsal-2026';
const round = Number(process.argv[2] ?? 2);
const db = admin();

const contest = (await db.doc(`contests/${CONTEST}`).get()).data()!;
const config = contest.rounds[round];
const teams = (await db.doc(`contests/${CONTEST}/teams/${round}`).get()).data()!;
const pool = (((await db.doc(`contests/${CONTEST}/pool/current`).get()).data()?.players ?? []) as
  { id: string; name: string; position: string; team: string }[]);
const lines = ((await db.doc(`contests/${CONTEST}/scores/${round}`).get()).data()?.players ?? {}) as
  Record<string, { stats: { pass_yd?: number } }>;

const board = await (await fetch(
  `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${contest.season}&seasontype=2&week=${config.week}`,
)).json() as { events?: { shortName: string; competitions?: { competitors?: { team: { abbreviation: string }; score: string; homeAway: string }[] }[] }[] };

const fixture = new Map<string, string>();
const points = new Map<string, number>();
for (const event of board.events ?? []) {
  const sides = event.competitions?.[0]?.competitors ?? [];
  for (const side of sides) {
    const other = sides.find((s) => s.team.abbreviation !== side.team.abbreviation);
    points.set(side.team.abbreviation, Number(side.score) || 0);
    fixture.set(side.team.abbreviation,
      `${side.homeAway === 'home' ? 'beat' : 'at'} ${other?.team.abbreviation} ${side.score}–${other?.score}`);
  }
}

const passingYards = (club: string) => Math.max(0, ...pool
  .filter((p) => p.team === club && p.position === 'QB')
  .map((p) => lines[p.id]?.stats?.pass_yd ?? 0));

console.log(`${config.name} — NFL week ${config.week}\n`);
for (const matchup of teams.matchups ?? []) {
  const call = decide({ ...matchup, winner: null }, (club) => points.get(club) ?? 0, passingYards, contest.field as Field);
  for (const club of [matchup.away, matchup.home]) {
    console.log(`  ${club.padEnd(4)} scored ${String(points.get(club) ?? 0).padStart(2)}  (${fixture.get(club) ?? 'no fixture'})   QB ${passingYards(club)} yds   seed ${(contest.field as Field)[club]?.seed}`);
  }
  console.log(`  → ${call.winner} through: ${call.why}\n`);
}
