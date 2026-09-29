/**
 * Locks a round at the first kickoff that actually matters.
 *
 * The lock exists to stop somebody picking a man after they have seen him play. That means it
 * belongs at the first kickoff involving a club still in the contest — not the first kickoff of
 * the NFL week, which is what it was set to when the rounds were seeded.
 *
 * By the Conference round the difference is three days. Four clubs are left and none of them plays
 * until Sunday morning, so a Thursday evening lock takes three days of picking away from everybody
 * and protects nothing at all.
 *
 * In January the two are usually the same, because a playoff round is only the teams still in it.
 * It is the rehearsal, running over a full NFL week, where they come apart.
 *
 *   node scripts/set-lock.ts [round]          say what it should be
 *   node scripts/set-lock.ts [round] --write  set it
 */
import { admin } from './admin.ts';

const CONTEST = 'rehearsal-2026';
const round = Number(process.argv[2] ?? 2);
const writing = process.argv.includes('--write');

const db = admin();
const ref = db.doc(`contests/${CONTEST}`);
const contest = (await ref.get()).data()!;
const config = (contest.rounds ?? []).find((entry: { round: number }) => entry.round === round);
if (!config) { console.log(`There is no round ${round}.`); process.exit(1); }

const teams = (await db.doc(`contests/${CONTEST}/teams/${round}`).get()).data();
if (!teams) {
  console.log(`Round ${round} has not been drawn yet — advance the round before, and the clubs`);
  console.log('still in it will be known.');
  process.exit(1);
}

const alive = new Set<string>(teams.alive ?? []);
const board = await (await fetch(
  `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${contest.season}&seasontype=2&week=${config.week}`,
)).json() as {
  events?: { date: string; shortName: string; competitions?: { competitors?: { team: { abbreviation: string } }[] }[] }[];
};

const theirs = (board.events ?? [])
  .map((event) => ({
    when: new Date(event.date),
    name: event.shortName,
    clubs: (event.competitions?.[0]?.competitors ?? []).map((side) => side.team.abbreviation),
  }))
  .filter((game) => game.clubs.some((club) => alive.has(club)))
  .sort((first, second) => first.when.getTime() - second.when.getTime());

if (theirs.length === 0) { console.log('No fixture this week involves a club still in the contest.'); process.exit(1); }

const first = theirs[0]!;
const was = contest.locks?.[String(round)]?.toDate?.() as Date | undefined;

console.log(`${config.name} — NFL week ${config.week}, clubs still in: ${[...alive].sort().join(', ')}\n`);
for (const game of theirs) {
  console.log(`  ${game.when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}  ${game.name}`);
}
console.log(`\n  was: ${was ? was.toLocaleString() : 'unset'}`);
console.log(`  now: ${first.when.toLocaleString()}  (${first.name})`);

if (!writing) { console.log('\nRun again with --write to set it.'); process.exit(0); }

await ref.update({ [`locks.${round}`]: first.when });
console.log('\nSet.');
