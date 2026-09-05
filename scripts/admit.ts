/**
 * Letting people in.
 *
 * Signing in with Google proves who somebody is; it does not prove they were invited. So joining is
 * two steps: they fill in the form, which writes an application, and the commissioner turns that
 * into an entry. A stranger who finds the link can knock and get no further.
 *
 * Deliberately a script rather than a screen. For a private contest among people you know, the
 * commissioner knowing who is in it is the whole access control system, and an approvals UI is a
 * lot of machinery to reimplement a decision that takes one glance.
 *
 *   node scripts/admit.ts --list
 *   node scripts/admit.ts someone@example.com
 */
import { getAuth } from 'firebase-admin/auth';
import { admin } from './admin.ts';

const CONTEST = 'rehearsal-2026';
const db = admin();
const auth = getAuth();

interface Application {
  name: string;
  teamName: string;
  phone: string;
  logo: string;
}

const [entries, applications, users] = await Promise.all([
  db.collection(`contests/${CONTEST}/entries`).get(),
  db.collection(`contests/${CONTEST}/applications`).get(),
  auth.listUsers(500),
]);

const emailOf = new Map(users.users.map((user) => [user.uid, user.email ?? user.uid]));
const members = new Set(entries.docs.map((entry) => entry.id));

if (process.argv[2] === '--list' || !process.argv[2]) {
  console.log(`In the league (${entries.size}):`);
  for (const entry of entries.docs) {
    const data = entry.data();
    const team = data.teamName && data.teamName !== data.name ? ` "${data.teamName}"` : '';
    console.log(`  ${String(data.name).padEnd(18)}${team.padEnd(22)} ${emailOf.get(entry.id) ?? entry.id}`);
  }

  const waiting = applications.docs.filter((application) => !members.has(application.id));
  console.log(waiting.length ? `\nWaiting (${waiting.length}):` : '\nNobody waiting.');
  for (const application of waiting) {
    const data = application.data() as Application;
    console.log(`  ${data.name} — "${data.teamName}"`);
    console.log(`     ${emailOf.get(application.id) ?? application.id}   ${data.phone || 'no phone given'}   ${data.logo ? 'badge uploaded' : 'no badge'}`);
    console.log(`     node scripts/admit.ts ${emailOf.get(application.id)}`);
  }
} else {
  const email = process.argv[2];
  const user = users.users.find((candidate) => candidate.email === email);
  if (!user) throw new Error(`${email} has not signed in, so there is no account to admit.`);

  const application = await db.doc(`contests/${CONTEST}/applications/${user.uid}`).get();
  const data = application.data() as Application | undefined;
  const name = data?.name ?? user.displayName ?? email;

  // The phone number stays on the application. An entry is readable by the whole league, and a
  // number given to the commissioner was not given to everybody.
  await db.doc(`contests/${CONTEST}/entries/${user.uid}`).set(
    { name, teamName: data?.teamName || name, logo: data?.logo ?? '', joinedAt: new Date() },
    { merge: true },
  );
  await db.collection(`contests/${CONTEST}/audit`).add({
    at: new Date(), actor: 'commissioner', action: 'manager admitted', detail: `${name} <${email}>`,
  });

  console.log(`${name} is in.`);
  if (data?.phone) console.log(`Text them: ${data.phone}`);
}
