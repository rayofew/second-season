/**
 * Lets somebody into the league.
 *
 * They sign in first — that is what creates the Firebase account — and then this attaches an entry
 * to their uid, which is what the security rules read as membership. Deliberately a script rather
 * than a screen: for a private contest among people you know, the commissioner knowing who is in it
 * is the whole access control system, and an invitation flow is a lot of machinery to reimplement
 * a text message.
 *
 *   node scripts/admit.ts someone@example.com "Their Name"
 *   node scripts/admit.ts --list
 */
import { getAuth } from 'firebase-admin/auth';
import { admin } from './admin.ts';

const CONTEST = 'rehearsal-2026';
const db = admin();
const auth = getAuth();

if (process.argv[2] === '--list') {
  const [entries, users] = await Promise.all([
    db.collection(`contests/${CONTEST}/entries`).get(),
    auth.listUsers(200),
  ]);
  const members = new Map(entries.docs.map((doc) => [doc.id, doc.data().name as string]));

  console.log('In the league:');
  for (const [uid, name] of members) {
    const user = users.users.find((candidate) => candidate.uid === uid);
    console.log(`  ${name.padEnd(16)} ${user?.email ?? uid}`);
  }
  const waiting = users.users.filter((user) => !members.has(user.uid));
  console.log(waiting.length ? '\nSigned in but not yet admitted:' : '\nNobody waiting.');
  for (const user of waiting) console.log(`  ${user.email} — node scripts/admit.ts ${user.email} "Name"`);
} else {
  const email = process.argv[2];
  const name = process.argv[3];
  if (!email || !name) throw new Error('Usage: node scripts/admit.ts <email> "<name>"');

  // They must have signed in already: we attach to the account Google made, never invent one.
  const user = await auth.getUserByEmail(email).catch(() => null);
  if (!user) throw new Error(`${email} has not signed in yet, so there is no account to admit.`);

  await db.doc(`contests/${CONTEST}/entries/${user.uid}`).set({ name, joinedAt: new Date() }, { merge: true });
  await db.collection(`contests/${CONTEST}/audit`).add({
    at: new Date(), actor: 'commissioner', action: 'manager admitted', detail: `${name} <${email}>`,
  });
  console.log(`${name} <${email}> is in. uid ${user.uid}`);
}
