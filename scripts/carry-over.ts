/**
 * Gives a manager who submitted nothing the team he already had.
 *
 * Doing nothing is a legitimate way to play a round — the picker has always said so, and opens
 * with last round's survivors already in the slots. But nothing was ever saved unless somebody
 * pressed submit, so a manager who looked at a perfectly good team and closed the tab scored
 * nought, which is not what anybody agreed to.
 *
 * So after a lock this writes it down for them: whoever survived from their last team, in the same
 * slots, with the men whose clubs went out left as empty slots. Nothing is invented — a player who
 * was never on their roster never appears, and somebody who has never submitted anything at all
 * has nothing to carry and stays on nought.
 *
 * Run it after the lock and before scoring. It refuses to touch a manager who did submit, so
 * running it twice is safe.
 *
 *   node scripts/carry-over.ts [round]          say what would be carried
 *   node scripts/carry-over.ts [round] --write  write it
 */
import { admin } from './admin.ts';

const CONTEST = 'rehearsal-2026';
const round = Number(process.argv[2] ?? 1);
const writing = process.argv.includes('--write');

if (round < 1) {
  console.log('There is nothing to carry into the opening round.');
  process.exit(0);
}

const db = admin();
const pool = new Map((((await db.doc(`contests/${CONTEST}/pool/current`).get()).data()?.players ?? []) as
  { id: string; name: string; team: string }[]).map((player) => [player.id, player]));

const teams = (await db.doc(`contests/${CONTEST}/teams/${round}`).get()).data();
if (!teams) { console.log(`Round ${round} has not been drawn.`); process.exit(1); }
const alive = new Set<string>(teams.alive ?? []);
const resting = new Set<string>(teams.byes ?? []);

const entries = await db.collection(`contests/${CONTEST}/entries`).get();
let carried = 0;

for (const entry of entries.docs) {
  const team = (entry.data().teamName as string) || (entry.data().name as string);
  const ref = db.doc(`contests/${CONTEST}/entries/${entry.id}/rounds/${round}`);

  const mine = ((await ref.get()).data()?.players ?? []) as unknown[];
  if (mine.length > 0) continue;

  const last = ((await db.doc(`contests/${CONTEST}/entries/${entry.id}/rounds/${round - 1}`).get())
    .data()?.players ?? []) as { playerId: string; slot: string; position: string; onBye?: boolean }[];
  if (last.length === 0) {
    console.log(`  ${team.padEnd(14)} nothing to carry — he has never submitted a team.`);
    continue;
  }

  // Resting is recomputed rather than copied: it is a fact about a club in a round.
  const survivors = last
    .filter((held) => alive.has(pool.get(held.playerId)?.team ?? ''))
    .map((held) => ({ ...held, onBye: resting.has(pool.get(held.playerId)?.team ?? '') }));

  carried += 1;
  console.log(
    `  ${team.padEnd(14)} carries ${survivors.length} of ${last.length}`
    + `  (${survivors.map((held) => pool.get(held.playerId)?.name ?? held.playerId).join(', ') || 'nobody'})`,
  );

  if (writing) {
    await ref.set({ players: survivors, submittedAt: new Date(), carriedOver: true });
  }
}

console.log(writing
  ? `\nWrote ${carried} carried-over team${carried === 1 ? '' : 's'}.`
  : `\n${carried} team${carried === 1 ? '' : 's'} to carry. Run again with --write.`);
