/**
 * Creates the first contest, which nothing else can.
 *
 * The rules say only a commissioner may write a contest, and commissioners are listed on the
 * contest document — so the very first one cannot be created by anything that goes through them.
 * That is correct rather than awkward: it means there is no path from a browser to a contest that
 * appoints its own commissioner. The seed comes in over the top, once, from a machine holding the
 * service account key.
 *
 * Lock times are the real first kickoff of each week, read from ESPN rather than guessed, because
 * the whole point of the lock is that it matches when football actually starts.
 */
import { EASTSIDE } from '../src/domain/rules.ts';
import { admin } from './admin.ts';

const COMMISSIONER = 'YmGUiqlUSudC5CEW5UYcsLYhnuE3';
const CONTEST = 'rehearsal-2026';
const SEASON = 2026;

// Four ordinary weeks standing in for the four playoff rounds. Configured, not hardcoded, so
// January is the same code with seasonType 'post' and weeks one to four.
const ROUNDS = [
  { round: 0, name: 'Wild Card', seasonType: 'regular' as const, week: 5 },
  { round: 1, name: 'Divisional', seasonType: 'regular' as const, week: 6 },
  { round: 2, name: 'Conference', seasonType: 'regular' as const, week: 7 },
  { round: 3, name: 'Super Bowl', seasonType: 'regular' as const, week: 8 },
];

async function firstKickoff(season: number, week: number): Promise<string> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
  const payload = await (await fetch(url, { signal: AbortSignal.timeout(20_000) })).json();
  const kickoffs = ((payload.events ?? []) as { date: string }[]).map((event) => event.date).sort();
  if (!kickoffs[0]) throw new Error(`No fixtures found for ${season} week ${week}`);
  return kickoffs[0];
}

const db = admin();

const locks: Record<string, Date> = {};
for (const round of ROUNDS) {
  const kickoff = await firstKickoff(SEASON, round.week);
  locks[String(round.round)] = new Date(kickoff);
  console.log(`${round.name.padEnd(11)} week ${round.week}  locks ${kickoff}`);
}

await db.doc(`contests/${CONTEST}`).set({
  name: 'Second Season — Rehearsal',
  season: SEASON,
  settings: EASTSIDE,
  rounds: ROUNDS.map((round) => ({ ...round, status: round.round === 0 ? 'open' : 'upcoming' })),
  currentRound: 0,
  status: 'open',
  commissioners: [COMMISSIONER],
  locks,
  createdAt: new Date(),
});

await db.doc(`contests/${CONTEST}/entries/${COMMISSIONER}`).set({
  name: 'Ray',
  joinedAt: new Date(),
});

// The first line of a history that must never be rewritten, only appended to.
await db.collection(`contests/${CONTEST}/audit`).add({
  at: new Date(),
  actor: 'seed',
  action: 'contest created',
  detail: `${ROUNDS.length} rounds, commissioner ${COMMISSIONER}`,
});

console.log(`\nSeeded ${CONTEST}: commissioner and first entry in place.`);
