/**
 * Decides a round and opens the next one.
 *
 * Our clubs never actually play each other, so a tie is settled by what each of them did in
 * whatever fixture the real schedule gave them: most points scored goes through, then the
 * quarterback with more passing yards, then the better seed. Always decisive, and it needs no
 * relationship between the two real games at all.
 *
 * Reseeding is the usual postseason shape — the best surviving seed in each conference plays the
 * worst — so the bracket stays recognisable even though the pairings are invented.
 *
 *   node scripts/advance.ts [round] --dry-run
 *
 * Always worth a dry run first: it prints what would happen and writes nothing.
 */
import { admin } from './admin.ts';
import type { StatLine } from '../src/domain/scoring.ts';

const CONTEST = 'rehearsal-2026';
const dry = process.argv.includes('--dry-run');
// Season and week may be overridden so the decision logic can be tried against football that has
// actually been played, months before our own week arrives.
const argSeason = process.argv.find((a) => a.startsWith('--season='));
const argWeek = process.argv.find((a) => a.startsWith('--week='));

const db = admin();
const contest = (await db.doc(`contests/${CONTEST}`).get()).data();
if (!contest) throw new Error('No contest');

const round = Number(process.argv[2] ?? contest.currentRound);
const config = contest.rounds[round];
if (!config) throw new Error(`No round ${round}`);

const teamsDoc = await db.doc(`contests/${CONTEST}/teams/${round}`).get();
const teams = teamsDoc.data() as { alive: string[]; byes: string[]; matchups: { home: string; away: string; winner: string | null }[] };
const field = contest.field as Record<string, { conference: string; seed: number }>;

/** What every club scored in its own real fixture that week. */
const season = argSeason ? Number(argSeason.split('=')[1]) : contest.season;
const week = argWeek ? Number(argWeek.split('=')[1]) : config.week;
const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
const board = await (await fetch(url, { signal: AbortSignal.timeout(25_000) })).json();
const scored = new Map<string, number>();
const finished = new Map<string, boolean>();
for (const event of board.events ?? []) {
  const competition = event.competitions?.[0];
  const done = competition?.status?.type?.completed === true;
  for (const side of competition?.competitors ?? []) {
    scored.set(side.team.abbreviation, Number(side.score));
    finished.set(side.team.abbreviation, done);
  }
}

/** Passing yards by the club's busiest quarterback, used only when the points are level. */
const pool = ((await db.doc(`contests/${CONTEST}/pool/current`).get()).data()?.players ?? []) as
  { id: string; name: string; position: string; team: string }[];
const stats = (await (await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`)).json()) as Record<string, StatLine>;
const passingYards = (club: string) =>
  Math.max(0, ...pool.filter((p) => p.team === club && p.position === 'QB').map((p) => stats[p.id]?.pass_yd ?? 0));

function decide(home: string, away: string): { winner: string; why: string } {
  const [hp, ap] = [scored.get(home) ?? 0, scored.get(away) ?? 0];
  if (hp !== ap) return { winner: hp > ap ? home : away, why: `${away} ${ap}, ${home} ${hp}` };
  const [hy, ay] = [passingYards(home), passingYards(away)];
  if (hy !== ay) return { winner: hy > ay ? home : away, why: `both ${hp}; passing yards ${away} ${ay}, ${home} ${hy}` };
  const better = field[home]!.seed < field[away]!.seed ? home : away;
  return { winner: better, why: `level on both; ${better} is the better seed` };
}

const unplayed = teams.matchups.flatMap((m) => [m.home, m.away]).filter((club) => !finished.get(club));
if (unplayed.length) {
  console.log(`Not everybody has finished: ${[...new Set(unplayed)].join(', ')}`);
  console.log('Results below are provisional.\n');
}

const decided = teams.matchups.map((matchup) => {
  const { winner, why } = decide(matchup.home, matchup.away);
  console.log(`${matchup.away.padEnd(4)} at ${matchup.home.padEnd(4)} -> ${winner.padEnd(4)}  (${why})`);
  return { ...matchup, winner };
});

// The winners, plus anybody who was resting, carry into the next round.
const through = [...decided.map((m) => m.winner!), ...teams.byes];
const next = round + 1;

// Reseeded the usual way: best surviving seed against worst, within each conference.
const pairings: { home: string; away: string; winner: null }[] = [];
for (const conference of ['AFC', 'NFC']) {
  const survivors = through
    .filter((club) => field[club]?.conference === conference)
    .sort((a, b) => field[a]!.seed - field[b]!.seed);
  for (let index = 0; index < Math.floor(survivors.length / 2); index += 1) {
    pairings.push({ home: survivors[index]!, away: survivors[survivors.length - 1 - index]!, winner: null });
  }
}
// The final is the last two standing, whatever conference they came from.
if (pairings.length === 0 && through.length === 2) {
  pairings.push({ home: through[0]!, away: through[1]!, winner: null });
}

console.log(`\nThrough to ${contest.rounds[next]?.name ?? 'the end'}: ${through.sort().join(', ')}`);
for (const p of pairings) console.log(`  ${p.away} at ${p.home}`);

if (dry || season !== contest.season || week !== config.week) {
  console.log('\nDry run: nothing written.');
} else {
  await db.doc(`contests/${CONTEST}/teams/${round}`).set({ ...teams, matchups: decided });
  if (contest.rounds[next]) {
    await db.doc(`contests/${CONTEST}/teams/${next}`).set({ alive: through, byes: [], matchups: pairings });
    await db.doc(`contests/${CONTEST}`).update({
      currentRound: next,
      rounds: contest.rounds.map((r: { round: number }) =>
        r.round === round ? { ...r, status: 'final' } : r.round === next ? { ...r, status: 'open' } : r,
      ),
    });
  } else {
    await db.doc(`contests/${CONTEST}`).update({ status: 'final' });
    console.log('\nThat was the last round. The contest is closed.');
  }
  await db.collection(`contests/${CONTEST}/audit`).add({
    at: new Date(), actor: 'commissioner', action: 'round advanced',
    detail: `round ${round} decided; ${through.join(', ')} through`,
  });
  console.log(`\nRound ${round} finalised and ${contest.rounds[next]?.name ?? 'nothing'} opened.`);
}
