/**
 * Who a manager is about to lose, before the round is advanced.
 *
 * Advancing takes six clubs out of the contest, and with them every player anybody was holding from
 * them. The rosters carry over on their own, so a manager arrives at the next round with empty
 * slots and a notice naming the men who have gone — which is the right behaviour and a bad
 * surprise if nobody warned him first.
 *
 * Read only. Prints who goes, who is affected, and by how much.
 *
 *   node scripts/who-loses.ts [round]
 */
import { admin } from './admin.ts';
import { decide } from '../src/domain/advance.ts';
import type { Field } from '../src/domain/advance.ts';

const CONTEST = 'rehearsal-2026';
const round = Number(process.argv[2] ?? 0);
const db = admin();

const [contestDoc, teamsDoc, poolDoc, entries, scoresDoc] = await Promise.all([
  db.doc(`contests/${CONTEST}`).get(),
  db.doc(`contests/${CONTEST}/teams/${round}`).get(),
  db.doc(`contests/${CONTEST}/pool/current`).get(),
  db.collection(`contests/${CONTEST}/entries`).get(),
  db.doc(`contests/${CONTEST}/scores/${round}`).get(),
]);

const contest = contestDoc.data()!;
const teams = teamsDoc.data()!;
const field = (contest.field ?? {}) as Field;
const config = contest.rounds[round];

interface Player { id: string; name: string; position: string; team: string }
const pool = new Map(((poolDoc.data()?.players ?? []) as Player[]).map((player) => [player.id, player]));
const lines = (scoresDoc.data()?.players ?? {}) as Record<string, { stats: { pass_yd?: number } }>;

const board = await (await fetch(
  `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${contest.season}&seasontype=2&week=${config.week}`,
)).json() as { events?: { competitions?: { competitors?: { team: { abbreviation: string }; score: string }[] }[] }[] };

const points = new Map<string, number>();
for (const event of board.events ?? []) {
  for (const side of event.competitions?.[0]?.competitors ?? []) {
    points.set(side.team.abbreviation, Number(side.score) || 0);
  }
}

const passingYards = (club: string) => Math.max(0, ...[...pool.values()]
  .filter((player) => player.team === club && player.position === 'QB')
  .map((player) => lines[player.id]?.stats?.pass_yd ?? 0));

const decisions = (teams.matchups ?? []).map((matchup: { home: string; away: string; winner: string | null }) =>
  decide(matchup, (club) => points.get(club) ?? 0, passingYards, field));

const out = new Set<string>(decisions
  .map((decision: { winner: string; home: string; away: string }) =>
    decision.winner === decision.home ? decision.away : decision.home));

console.log(`Advancing ${config.name} puts these clubs out: ${[...out].sort().join(', ')}\n`);

let mostAffected = 0;
for (const entry of entries.docs) {
  const roster = await db.doc(`contests/${CONTEST}/entries/${entry.id}/rounds/${round}`).get();
  const players = (roster.data()?.players ?? []) as { playerId: string; slot: string }[];
  if (players.length === 0) continue;

  const losing = players
    .map((held) => ({ ...held, who: pool.get(held.playerId) }))
    .filter((held) => held.who && out.has(held.who.team));

  const team = (entry.data().teamName as string) || (entry.data().name as string);
  mostAffected = Math.max(mostAffected, losing.length);

  console.log(
    losing.length === 0
      ? `  ${team.padEnd(16)} keeps all ${players.length}`
      : `  ${team.padEnd(16)} loses ${losing.length} of ${players.length}: `
        + losing.map((held) => `${held.who!.name} (${held.slot})`).join(', '),
  );
}

console.log(
  `\nWorst hit: ${mostAffected} slots to refill. Those slots come back empty with a notice naming`
  + '\nthe men who went, and whoever replaces them starts again at 1x. Nothing about the rounds'
  + '\nalready played changes — the standings and the move log keep every one of them.',
);
