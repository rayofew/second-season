import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { decide, reseed } from '../../src/domain/advance.ts';
import type { Decision, Field, Matchup } from '../../src/domain/advance.ts';
import { EASTSIDE } from '../../src/domain/rules.ts';
import type { ContestSettings } from '../../src/domain/rules.ts';
import type { StatLine } from '../../src/domain/scoring.ts';
import { carriedTeam, scoreRound } from '../../src/domain/scoreround.ts';
import type { PoolEntry } from '../../src/domain/scoreround.ts';

/**
 * Score a round and advance it, in one press.
 *
 * Ray: "Im good with manually advancing when a week is over but i want it to be a one and done
 * situation." It used to be two steps on two machines: run scripts/score.ts where the admin key
 * lived, then press Advance on Commish. A browser may not write scores — the rules refuse every
 * client, so nobody can type a figure in — and that is still true. This runs on Firebase with the
 * project's own credentials instead, so the Advance button calls it and it does the lot:
 *
 *   1. refuses anybody who is not a commissioner of that game, and any round that has not locked or
 *      still has a club playing;
 *   2. carries over the team of anybody who never pressed submit (scripts/carry-over.ts);
 *   3. scores the round from Sleeper (scripts/score.ts), with the same scoring code;
 *   4. copies the round's lineups into one document for the pages to read;
 *   5. decides every tie, draws the next round and sets its lock to the first kickoff any survivor
 *      plays in, or closes the contest after the last round — exactly as the Advance button did.
 *
 * With { dryRun: true } it does all the working out and writes nothing, which is what Commish shows
 * before the press.
 */

initializeApp();
const db = getFirestore();

const ESPN_TYPE: Record<string, number> = { pre: 1, regular: 2, post: 3 };

interface RoundConfig { round: number; name: string; week: number; seasonType: 'regular' | 'post'; status?: string }

interface Fixture { points: number; final: boolean; kickoff: Date }

async function fixtures(season: number, week: number, seasonType: string): Promise<Map<string, Fixture>> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=${ESPN_TYPE[seasonType] ?? 2}&week=${week}`;
  const board = (await (await fetch(url, { signal: AbortSignal.timeout(25_000) })).json()) as { events?: { date: string; competitions?: { status?: { type?: { completed?: boolean } }; competitors?: { score: string; team: { abbreviation: string } }[] }[] }[] };
  const out = new Map<string, Fixture>();
  for (const event of board.events ?? []) {
    const competition = event.competitions?.[0];
    const final = competition?.status?.type?.completed === true;
    for (const side of competition?.competitors ?? []) {
      out.set(side.team.abbreviation, { points: Number(side.score) || 0, final, kickoff: new Date(event.date) });
    }
  }
  return out;
}

export const scoreAndAdvance = onCall({ timeoutSeconds: 180, memory: '512MiB' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const game = String(request.data?.game ?? '');
  const dryRun = request.data?.dryRun === true;
  if (!game) throw new HttpsError('invalid-argument', 'Which game?');

  const contestRef = db.doc(`contests/${game}`);
  const contest = (await contestRef.get()).data();
  if (!contest) throw new HttpsError('not-found', 'No such game.');
  if (!(contest.commissioners ?? []).includes(uid)) throw new HttpsError('permission-denied', 'Only a commissioner can advance a round.');
  if (contest.status === 'final') throw new HttpsError('failed-precondition', 'This game is already over.');

  const round = Number(contest.currentRound ?? 0);
  const rounds = (contest.rounds ?? []) as RoundConfig[];
  const config = rounds[round];
  if (!config) throw new HttpsError('failed-precondition', `There is no round ${round + 1}.`);
  const lock = contest.locks?.[String(round)]?.toDate?.() as Date | undefined;
  if (!lock || lock > new Date()) throw new HttpsError('failed-precondition', `${config.name} has not locked yet.`);

  const settings = (contest.settings ?? EASTSIDE) as ContestSettings;
  const field = (contest.field ?? {}) as Field;
  const teams = (await db.doc(`contests/${game}/teams/${round}`).get()).data() as
    { alive: string[]; byes: string[]; matchups: Matchup[] } | undefined;
  if (!teams) throw new HttpsError('failed-precondition', `${config.name} has not been drawn.`);
  const alive = new Set<string>(teams.alive ?? []);
  const resting = new Set<string>(teams.byes ?? []);

  // Every club in the round has to have finished, or an unfinished game would count as nothing.
  const results = await fixtures(contest.season, config.week, config.seasonType);
  const clubs = [...new Set(teams.matchups.flatMap((matchup) => [matchup.home, matchup.away]))];
  const unfinished = clubs.filter((club) => !results.get(club)?.final);
  if (unfinished.length > 0) {
    throw new HttpsError('failed-precondition', `Still playing: ${unfinished.join(', ')}. Wait until every game is final.`);
  }

  const pool = ((await db.doc(`contests/${game}/pool/current`).get()).data()?.players ?? []) as PoolEntry[];
  const clubOf = new Map(pool.map((player) => [player.id, player.team]));
  const statsUrl = `https://api.sleeper.app/v1/stats/nfl/${config.seasonType}/${contest.season}/${config.week}`;
  const stats = (await (await fetch(statsUrl, { signal: AbortSignal.timeout(30_000) })).json()) as Record<string, StatLine>;

  // 2. Carry over anybody who never pressed submit, before anything is scored.
  const entries = await db.collection(`contests/${game}/entries`).get();
  const rosters: Record<string, unknown[]> = {};
  const carried: string[] = [];
  for (const entry of entries.docs) {
    const ref = entry.ref.collection('rounds').doc(String(round));
    let mine = ((await ref.get()).data()?.players ?? []) as { playerId: string; onBye?: boolean }[];
    if (mine.length === 0 && round > 0) {
      const last = ((await entry.ref.collection('rounds').doc(String(round - 1)).get()).data()?.players ?? []) as
        { playerId: string; onBye?: boolean }[];
      if (last.length > 0) {
        mine = carriedTeam(last, (id) => clubOf.get(id), alive, resting);
        carried.push((entry.data().teamName as string) || (entry.data().name as string) || entry.id);
        if (!dryRun) await ref.set({ players: mine, submittedAt: new Date(), carriedOver: true });
      }
    }
    rosters[entry.id] = mine;
  }

  // 3. Score it.
  const scored = scoreRound(pool, stats, alive, resting, settings);

  // 5. Decide it. Passing yards only matter when two clubs that never met scored the same.
  const passingYards = (club: string) =>
    Math.max(0, ...pool.filter((player) => player.team === club && player.position === 'QB').map((player) => stats[player.id]?.pass_yd ?? 0));
  const decisions: Decision[] = teams.matchups.map((matchup) =>
    decide(matchup, (club) => results.get(club)?.points ?? 0, passingYards, field));
  const through = [...decisions.map((decision) => decision.winner), ...(teams.byes ?? [])];
  const next = rounds[round + 1];
  const pairings = next ? reseed(through, field) : [];

  let nextLock: Date | undefined;
  if (next) {
    const schedule = await fixtures(contest.season, next.week, next.seasonType).catch(() => null);
    const kickoffs = through.map((club) => schedule?.get(club)?.kickoff).filter((when): when is Date => when instanceof Date);
    if (kickoffs.length > 0) nextLock = new Date(Math.min(...kickoffs.map((when) => when.getTime())));
  }

  const summary = {
    round: config.name,
    next: next?.name ?? null,
    scoredPlayers: scored.played,
    carried,
    decisions: decisions.map((decision) => ({ winner: decision.winner, why: decision.why })),
    through,
    nextLock: nextLock?.toISOString() ?? null,
    dryRun,
  };
  if (dryRun) return summary;

  const batch = db.batch();
  batch.set(db.doc(`contests/${game}/scores/${round}`), {
    round, week: config.week, season: contest.season, updatedAt: new Date(), players: scored.players, scoredBy: uid,
  });
  // 4. The lineups in one document, which every table reads instead of one roster per manager.
  batch.set(db.doc(`contests/${game}/lineups/${round}`), { round, rosters, builtAt: new Date() });
  batch.update(db.doc(`contests/${game}/teams/${round}`), { matchups: decisions });
  if (next) {
    batch.set(db.doc(`contests/${game}/teams/${round + 1}`), { alive: through, byes: [], matchups: pairings });
    batch.update(contestRef, {
      currentRound: round + 1,
      ...(nextLock ? { [`locks.${round + 1}`]: nextLock } : {}),
      rounds: rounds.map((entry) =>
        entry.round === round ? { ...entry, status: 'final' }
        : entry.round === round + 1 ? { ...entry, status: 'open' }
        : entry),
    });
  } else {
    batch.update(contestRef, { status: 'final' });
  }
  batch.set(db.collection(`contests/${game}/audit`).doc(), {
    at: FieldValue.serverTimestamp(),
    actor: uid,
    action: 'round scored and advanced',
    detail: `${config.name}: ${scored.played} players scored; ${carried.length} carried over; ${through.join(', ')} through`,
  });
  await batch.commit();
  return summary;
});
