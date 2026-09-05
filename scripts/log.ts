/**
 * The whole record, for looking at afterwards.
 *
 * The app shows managers only what has locked. This shows everything, including the submissions
 * themselves — how many times somebody resubmitted before a deadline is exactly the sort of thing
 * a shakedown is for, and it is invisible in the rosters, which only ever hold the final answer.
 *
 *   node scripts/log.ts            everything, oldest first
 *   node scripts/log.ts --csv      the same, for a spreadsheet
 */
import { admin } from './admin.ts';

const CONTEST = 'rehearsal-2026';
const csv = process.argv.includes('--csv');

const db = admin();
const [contest, entries, log] = await Promise.all([
  db.doc(`contests/${CONTEST}`).get(),
  db.collection(`contests/${CONTEST}/entries`).get(),
  db.collection(`contests/${CONTEST}/log`).orderBy('at').get(),
]);

const roundName = (round: number) => contest.data()?.rounds?.[round]?.name ?? `round ${round}`;
const teamOf = new Map(entries.docs.map((entry) => [entry.id, (entry.data().teamName as string) || entry.data().name]));

if (csv) {
  console.log('at,round,team,action,player,slot');
  for (const entry of log.docs) {
    const move = entry.data();
    const at = move.at?.toDate?.().toISOString() ?? '';
    console.log(`${at},${roundName(move.round)},"${teamOf.get(move.uid) ?? move.uid}",${move.action},"${move.playerName}",${move.slot}`);
  }
} else {
  console.log(`${log.size} entries\n`);
  let submissions = 0;
  const byTeam = new Map<string, { in: number; out: number; submits: number }>();

  for (const entry of log.docs) {
    const move = entry.data();
    const team = teamOf.get(move.uid) ?? move.uid;
    const at = move.at?.toDate?.() as Date | undefined;
    const when = at ? at.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    const tally = byTeam.get(team) ?? { in: 0, out: 0, submits: 0 };

    if (move.action === 'submitted') {
      submissions += 1;
      tally.submits += 1;
      console.log(`${when.padEnd(20)} ${String(team).padEnd(16)} submitted ${roundName(move.round)}`);
    } else {
      tally[move.action as 'in' | 'out'] += 1;
      const arrow = move.action === 'in' ? 'signed  ' : 'dropped ';
      console.log(`${when.padEnd(20)} ${String(team).padEnd(16)} ${arrow}${move.playerName} (${move.slot})`);
    }
    byTeam.set(team, tally);
  }

  console.log(`\n${submissions} submissions across ${byTeam.size} managers\n`);
  for (const [team, tally] of [...byTeam].sort((a, b) => b[1].submits - a[1].submits)) {
    console.log(`  ${team.padEnd(18)} ${tally.submits} submissions, ${tally.in} signed, ${tally.out} dropped`);
  }
}
