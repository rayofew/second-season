/** Where the contest actually stands, for answering "what do I do next". */
import { admin } from './admin.ts';
const CONTEST = 'rehearsal-2026';
const db = admin();
const contest = (await db.doc(`contests/${CONTEST}`).get()).data()!;
console.log(`status: ${contest.status}   currentRound: ${contest.currentRound}`);
for (const round of contest.rounds ?? []) {
  const [teams, scores] = await Promise.all([
    db.doc(`contests/${CONTEST}/teams/${round.round}`).get(),
    db.doc(`contests/${CONTEST}/scores/${round.round}`).get(),
  ]);
  const t = teams.data();
  const decided = (t?.matchups ?? []).filter((m: { winner?: string }) => m.winner).length;
  const players = Object.keys(scores.data()?.players ?? {}).length;
  const lock = contest.locks?.[String(round.round)]?.toDate?.();
  console.log(
    `\nround ${round.round}  ${round.name}  (week ${round.week}, ${round.status})`
    + `\n  locks    ${lock ? lock.toLocaleString() : 'none'}${lock && lock <= new Date() ? '  — passed' : ''}`
    + `\n  bracket  ${teams.exists ? `${(t?.matchups ?? []).length} ties, ${decided} decided; alive ${(t?.alive ?? []).length}, resting ${(t?.byes ?? []).join(',') || 'none'}` : 'not drawn'}`
    + `\n  scores   ${scores.exists ? `${players} players` : 'never scored'}`,
  );
}
