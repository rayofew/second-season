/**
 * The invented bracket, and the four weeks it runs over.
 *
 * Fourteen clubs in their real conferences and divisions, seeded the usual way. They will never
 * actually play each other — a round is decided by which of two bracket opponents scored more in
 * whatever fixture the real schedule gave them, so any four weeks of football can stand in for a
 * postseason.
 *
 * Weeks two to five, because only week five has byes (Carolina and Kansas City, both excluded) and
 * a club resting during our Super Bowl round would have no statistics at all.
 */
import { admin } from './admin.ts';

const CONTEST = 'rehearsal-2026';
const SEASON = 2026;

const FIELD = {
  AFC: ['DEN', 'NE', 'JAX', 'PIT', 'BUF', 'HOU', 'LAC'],
  NFC: ['SEA', 'PHI', 'CHI', 'TB', 'LAR', 'SF', 'GB'],
} as const;

const ROUNDS = [
  { round: 0, name: 'Wild Card', week: 2 },
  { round: 1, name: 'Divisional', week: 3 },
  { round: 2, name: 'Conference', week: 4 },
  { round: 3, name: 'Super Bowl', week: 5 },
];

async function firstKickoff(week: number): Promise<Date> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${SEASON}&seasontype=2&week=${week}`;
  const payload = await (await fetch(url, { signal: AbortSignal.timeout(20_000) })).json();
  const kickoffs = ((payload.events ?? []) as { date: string }[]).map((event) => event.date).sort();
  if (!kickoffs[0]) throw new Error(`No fixtures for week ${week}`);
  return new Date(kickoffs[0]);
}

const seeds: Record<string, { conference: string; seed: number }> = {};
for (const [conference, clubs] of Object.entries(FIELD)) {
  clubs.forEach((club, index) => { seeds[club] = { conference, seed: index + 1 }; });
}

// The top seed in each conference rests; the rest pair 2v7, 3v6, 4v5.
const byes = [FIELD.AFC[0], FIELD.NFC[0]];
const matchups = Object.values(FIELD).flatMap((clubs) =>
  [[1, 6], [2, 5], [3, 4]].map(([high, low]) => ({
    home: clubs[high!]!,
    away: clubs[low!]!,
    winner: null as string | null,
  })),
);

const db = admin();
const locks: Record<string, Date> = {};
for (const round of ROUNDS) locks[String(round.round)] = await firstKickoff(round.week);

await db.doc(`contests/${CONTEST}`).set(
  {
    rounds: ROUNDS.map((round) => ({
      ...round,
      seasonType: 'regular',
      status: round.round === 0 ? 'open' : 'upcoming',
    })),
    locks,
    field: seeds,
    currentRound: 0,
  },
  { merge: true },
);

// Round zero: everybody is alive, two are resting.
await db.doc(`contests/${CONTEST}/teams/0`).set({
  alive: [...FIELD.AFC, ...FIELD.NFC],
  byes,
  matchups,
});

for (const round of ROUNDS) {
  console.log(`${round.name.padEnd(11)} week ${round.week}  locks ${locks[String(round.round)]!.toISOString()}`);
}
console.log(`\nByes: ${byes.join(', ')}`);
for (const m of matchups) console.log(`  ${m.away} at ${m.home}`);
