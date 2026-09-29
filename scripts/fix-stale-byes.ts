/**
 * Corrects a bye flag a roster carried in from a round where the club actually rested.
 *
 * Resting is a fact about a club in a round. The flag was copied along with the player when a
 * roster carried over, so a Seattle man kept through the Wild Card arrived in the Divisional round
 * still marked as resting. The scorer no longer reads the flag, so this changes no score — but a
 * roster that says something untrue about a week is worth correcting while anybody still remembers
 * why it said it.
 *
 *   node scripts/fix-stale-byes.ts          say what is wrong
 *   node scripts/fix-stale-byes.ts --write  put it right
 */
import { admin } from './admin.ts';

const CONTEST = 'rehearsal-2026';
const writing = process.argv.includes('--write');
const db = admin();

const contest = (await db.doc(`contests/${CONTEST}`).get()).data()!;
const pool = new Map((((await db.doc(`contests/${CONTEST}/pool/current`).get()).data()?.players ?? []) as
  { id: string; team: string; name: string }[]).map((p) => [p.id, p]));
const entries = await db.collection(`contests/${CONTEST}/entries`).get();

let wrong = 0;
for (const round of (contest.rounds ?? []).map((r: { round: number }) => r.round)) {
  const teams = (await db.doc(`contests/${CONTEST}/teams/${round}`).get()).data();
  if (!teams) continue;
  const resting = new Set<string>(teams.byes ?? []);

  for (const entry of entries.docs) {
    const ref = db.doc(`contests/${CONTEST}/entries/${entry.id}/rounds/${round}`);
    const snapshot = await ref.get();
    if (!snapshot.exists) continue;

    const players = (snapshot.data()?.players ?? []) as { playerId: string; onBye?: boolean }[];
    const fixed = players.map((held) => {
      const truth = resting.has(pool.get(held.playerId)?.team ?? '');
      return Boolean(held.onBye) === truth ? held : { ...held, onBye: truth };
    });

    const changed = fixed.filter((held, index) => held !== players[index]);
    if (changed.length === 0) continue;
    wrong += changed.length;

    const team = (entry.data().teamName as string) || (entry.data().name as string);
    for (const held of changed) {
      console.log(`  round ${round}  ${team.padEnd(14)} ${(pool.get(held.playerId)?.name ?? held.playerId).padEnd(22)} → onBye ${held.onBye}`);
    }
    if (writing) await ref.update({ players: fixed });
  }
}

console.log(writing ? `\nCorrected ${wrong}.` : `\n${wrong} to correct. Run again with --write.`);
