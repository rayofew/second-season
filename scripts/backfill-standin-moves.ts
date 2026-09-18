/**
 * Give the stand-ins the history their rosters imply.
 *
 * They were picked for before the bench recorded any moves, so they sit on the Moves tab as the
 * only managers in the league with a full nine and no trace of how they got it — which is the
 * loudest thing about them, and the one thing they are not supposed to be.
 *
 * Rosters are not touched. This reads what each of them already plays, works out the same diff a
 * real submission would have recorded, and writes it at a plausible hour. Rounds that already have
 * moves are left alone, because the log is append only and a second pass would have somebody
 * signing the same player twice in an afternoon.
 *
 *   node scripts/backfill-standin-moves.ts          say what it would write
 *   node scripts/backfill-standin-moves.ts --write  write it
 */
import { admin } from './admin.ts';
import { whenPicked } from '../src/domain/standin.ts';

const CONTEST = 'rehearsal-2026';
const writing = process.argv.includes('--write');

const db = admin();

const [contestDoc, register, poolDoc] = await Promise.all([
  db.doc(`contests/${CONTEST}`).get(),
  db.doc(`contests/${CONTEST}/admin/standins`).get(),
  db.doc(`contests/${CONTEST}/pool/current`).get(),
]);

const contest = contestDoc.data()!;
const temperaments = (register.data()?.temperaments ?? {}) as Record<string, string>;
const uids = Object.keys(temperaments);
if (uids.length === 0) {
  console.log('No stand-ins on the bench. Nothing to do.');
  process.exit(0);
}

const named = new Map(
  ((poolDoc.data()?.players ?? []) as { id: string; name: string }[]).map((player) => [player.id, player.name]),
);
const rounds: { round: number; name: string }[] = contest.rounds ?? [];

let planned = 0;

for (const uid of uids) {
  const entry = await db.doc(`contests/${CONTEST}/entries/${uid}`).get();
  const team = (entry.data()?.teamName as string) || (entry.data()?.name as string) || uid;

  let previous: { playerId: string; slot: string }[] = [];

  for (const { round, name } of rounds) {
    const roster = await db.doc(`contests/${CONTEST}/entries/${uid}/rounds/${round}`).get();
    if (!roster.exists) continue;
    const players = (roster.data()?.players ?? []) as { playerId: string; slot: string }[];

    const already = await db.collection(`contests/${CONTEST}/log`)
      .where('uid', '==', uid).where('round', '==', round).limit(1).get();

    if (already.empty && players.length > 0) {
      const before = new Set(previous.map((held) => held.playerId));
      const after = new Set(players.map((held) => held.playerId));
      const moves = [
        ...players.filter((held) => !before.has(held.playerId)).map((held) => ({
          uid, round, action: 'in' as const,
          playerId: held.playerId, playerName: named.get(held.playerId) ?? held.playerId, slot: held.slot,
        })),
        ...previous.filter((held) => !after.has(held.playerId)).map((held) => ({
          uid, round, action: 'out' as const,
          playerId: held.playerId, playerName: named.get(held.playerId) ?? held.playerId, slot: held.slot,
        })),
        { uid, round, action: 'submitted' as const, playerId: '', playerName: '', slot: '' },
      ];

      const lock = contest.locks?.[String(round)]?.toDate?.() ?? new Date();
      const at = whenPicked(uid, round, lock);

      console.log(
        `${team.padEnd(16)} ${name.padEnd(12)} ${String(moves.length - 1).padStart(2)} moves`
        + `  at ${at.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`,
      );
      planned += moves.length;

      if (writing) {
        const batch = db.batch();
        for (const move of moves) {
          batch.set(db.collection(`contests/${CONTEST}/log`).doc(), { ...move, at });
        }
        await batch.commit();
      }
    } else if (!already.empty) {
      console.log(`${team.padEnd(16)} ${name.padEnd(12)} already has moves — left alone`);
    }

    previous = players;
  }
}

console.log(
  writing
    ? `\nWrote ${planned} log entries.`
    : `\nWould write ${planned} log entries. Run again with --write.`,
);
