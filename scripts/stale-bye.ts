/**
 * Men carrying a bye flag from a round where their club actually rested.
 *
 * The flag is copied along with the player when a roster carries over, so somebody who kept a
 * Seattle man through the Wild Card arrives in the Divisional round still marked as resting — and
 * the scorer, quite correctly, gives a resting man nought.
 */
import { admin } from './admin.ts';
const CONTEST = 'rehearsal-2026';
const db = admin();
const contest = (await db.doc(`contests/${CONTEST}`).get()).data()!;
const pool = new Map((((await db.doc(`contests/${CONTEST}/pool/current`).get()).data()?.players ?? []) as
  { id: string; name: string; team: string }[]).map((p) => [p.id, p]));
const entries = await db.collection(`contests/${CONTEST}/entries`).get();

for (const round of contest.rounds.map((r: { round: number }) => r.round)) {
  const teams = (await db.doc(`contests/${CONTEST}/teams/${round}`).get()).data();
  if (!teams) continue;
  const resting = new Set<string>(teams.byes ?? []);
  const scores = ((await db.doc(`contests/${CONTEST}/scores/${round}`).get()).data()?.players ?? {}) as
    Record<string, { raw: number }>;

  const wrong: string[] = [];
  for (const entry of entries.docs) {
    const roster = ((await db.doc(`contests/${CONTEST}/entries/${entry.id}/rounds/${round}`).get())
      .data()?.players ?? []) as { playerId: string; slot: string; onBye?: boolean }[];
    for (const held of roster) {
      const who = pool.get(held.playerId);
      if (!held.onBye || !who) continue;
      if (resting.has(who.team)) continue;
      const lost = scores[held.playerId]?.raw ?? 0;
      wrong.push(`${((entry.data().teamName as string) || entry.data().name).padEnd(14)} ${who.name.padEnd(22)} ${who.team}  ${lost.toFixed(2).padStart(6)} pts lost`);
    }
  }
  console.log(`\nround ${round} (resting: ${[...resting].join(',') || 'none'}) — ${wrong.length} wrongly marked:`);
  for (const line of wrong) console.log('  ' + line);
}
