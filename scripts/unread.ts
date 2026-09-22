/**
 * Who would see a notice about the board, and who would not.
 *
 * "It did not show up" has three innocent causes — there is nothing new, you wrote it yourself, or
 * you have already opened the board — and no way to tell them apart from the outside.
 *
 *   node scripts/unread.ts
 *   node scripts/unread.ts --mark-unread <name>   forget that one manager has read it
 */
import { admin } from './admin.ts';
import { FieldValue } from 'firebase-admin/firestore';

const CONTEST = 'rehearsal-2026';
const forget = process.argv.includes('--mark-unread') ? process.argv[process.argv.indexOf('--mark-unread') + 1]?.toLowerCase() : undefined;

const db = admin();
const [posts, entries] = await Promise.all([
  db.collection(`contests/${CONTEST}/posts`).orderBy('at', 'desc').limit(5).get(),
  db.collection(`contests/${CONTEST}/entries`).get(),
]);

const said = posts.docs.map((post) => ({
  uid: post.data().uid as string,
  at: post.data().at?.toDate?.() as Date | undefined,
}));

for (const entry of entries.docs) {
  const data = entry.data();
  const team = (data.teamName as string) || (data.name as string);
  const read = data.lastReadBoard?.toDate?.() as Date | undefined;

  if (forget && team.toLowerCase().includes(forget)) {
    await entry.ref.update({ lastReadBoard: FieldValue.delete() });
    console.log(`  ${team} — forgotten, the board is all new to him again`);
    continue;
  }

  const unread = said.filter((post) => post.uid !== entry.id && (!read || (post.at && post.at > read)));
  const why = unread.length > 0 ? `${unread.length} waiting`
    : said.every((post) => post.uid === entry.id) ? 'wrote all of it himself'
    : read ? `read it ${read.toLocaleString()}`
    : 'nothing on the board';
  console.log(`  ${team.padEnd(14)} ${why}`);
}
