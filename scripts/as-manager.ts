/**
 * What can an ordinary manager actually read?
 *
 * The security rules are the only thing standing between one manager and everybody else's team, and
 * until now the only way to check them was to reason about them. Reasoning is not good enough: a
 * query for round == 0 is allowed and the same query for round <= 0 is refused, which nobody would
 * guess and which silently emptied the whole Moves tab for every manager who was not a
 * commissioner.
 *
 * So this asks the real rules on the real database, as a real member, read only. It mints a
 * short-lived token for one of the league's own accounts — no password, nothing written, and the
 * token expires in an hour.
 *
 *   node scripts/as-manager.ts                  list the accounts it can test as
 *   node scripts/as-manager.ts <uid|name>       run the checks as that manager
 *
 * The emulator suite in tests/emulator is the better tool and needs Java, which this machine does
 * not have. This needs nothing but the service-account key.
 */
import { getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { admin } from './admin.ts';

const CONTEST = 'rehearsal-2026';
const PROJECT = 'second-season-app-2cf68';
/** The public web key. It identifies the project and grants nothing on its own. */
const KEY = 'AIzaSyCRvAGyL6whH0dZqZC2_kwpUOiZWAfFLU0';

const wanted = process.argv[2]?.toLowerCase();
const db = admin();

const [entries, contestDoc] = await Promise.all([
  db.collection(`contests/${CONTEST}/entries`).get(),
  db.doc(`contests/${CONTEST}`).get(),
]);
const contest = contestDoc.data()!;
const commissioners: string[] = contest.commissioners ?? [];

const who = wanted && entries.docs.find((entry) => {
  const data = entry.data();
  return entry.id.toLowerCase() === wanted
    || `${data.name ?? ''} ${data.teamName ?? ''}`.toLowerCase().includes(wanted);
});

if (!who) {
  console.log('Test as which manager? Pass a uid or part of a name:\n');
  for (const entry of entries.docs) {
    const data = entry.data();
    const role = commissioners.includes(entry.id) ? ' (commissioner — sees everything)' : '';
    console.log(`  ${entry.id}  ${data.name}${role}`);
  }
  process.exit(wanted ? 1 : 0);
}

const role = commissioners.includes(who.id) ? 'a commissioner' : 'an ordinary manager';
console.log(`Asking as ${who.data().name} — ${role}.\n`);

const custom = await getAuth(getApps()[0]!).createCustomToken(who.id);
const exchange = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${KEY}`,
  { method: 'POST', body: JSON.stringify({ token: custom, returnSecureToken: true }) },
);
const { idToken, error } = (await exchange.json()) as { idToken?: string; error?: unknown };
if (!idToken) {
  console.error('Could not get a token:', error);
  process.exit(1);
}

const headers = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };

async function get(label: string, path: string) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${path}`,
    { headers },
  );
  console.log(`  ${response.ok ? 'yes' : `no  (${response.status})`}  ${label}`);
}

async function ask(label: string, structuredQuery: unknown) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/contests/${CONTEST}:runQuery`,
    { method: 'POST', headers, body: JSON.stringify({ structuredQuery }) },
  );
  if (!response.ok) {
    console.log(`  no  (${response.status})  ${label}`);
    return;
  }
  const rows = ((await response.json()) as { document?: unknown }[]).filter((row) => row.document);
  console.log(`  yes, ${String(rows.length).padStart(3)}    ${label}`);
}

const locked = (contest.rounds ?? [])
  .filter((round: { round: number }) => (contest.locks?.[String(round.round)]?.toDate?.() ?? new Date()) <= new Date())
  .map((round: { round: number }) => round.round as number);

console.log(`Rounds that have locked: ${locked.length ? locked.join(', ') : 'none'}\n`);

await get('the contest itself', `contests/${CONTEST}`);
await ask('the message board', { from: [{ collectionId: 'posts' }], limit: 200 });
await get('the player pool', `contests/${CONTEST}/pool/current`);

// The shape the app asks for, and the two shapes that are refused — kept because the difference
// between them is the entire finding.
for (const round of locked) {
  await ask(`moves where round == ${round}   (what the app asks)`, {
    from: [{ collectionId: 'log' }],
    where: { fieldFilter: { field: { fieldPath: 'round' }, op: 'EQUAL', value: { integerValue: String(round) } } },
    limit: 300,
  });
}
await ask('moves where round <= last locked  (refused: a range proves nothing)', {
  from: [{ collectionId: 'log' }],
  where: {
    fieldFilter: {
      field: { fieldPath: 'round' },
      op: 'LESS_THAN_OR_EQUAL',
      value: { integerValue: String(Math.max(0, ...locked)) },
    },
  },
  limit: 300,
});
await ask('every move, newest first        (refused unless commissioner)', {
  from: [{ collectionId: 'log' }],
  orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }],
  limit: 300,
});
