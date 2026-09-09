/**
 * A field of stand-in managers, so the league can be tested without waiting for people.
 *
 * These are not accounts. Nobody can sign in as one and nothing here touches Firebase Auth — they
 * are entries and rosters written straight into the contest with the Admin SDK, which is all the
 * standings, the live board, the prize pool and a Monday advance actually read. Testing the parts
 * that will break does not require six people to remember six passwords.
 *
 * Every document is marked `stand_in: true` and every uid begins `stand-in-`, so --remove can take
 * the whole field out again without a chance of catching a real manager in the sweep.
 *
 *   node scripts/seed-testers.ts                 # six of them, with rosters for the open round
 *   node scripts/seed-testers.ts 10              # ten
 *   node scripts/seed-testers.ts --no-rosters    # entries only, nobody has picked yet
 *   node scripts/seed-testers.ts --remove        # take them all out again
 *
 * Run it again to re-roll the rosters: it overwrites rather than duplicating.
 */
import { admin } from './admin.ts';
import { EASTSIDE } from '../src/domain/rules.ts';
import type { Position } from '../src/domain/rules.ts';

const CONTEST = 'rehearsal-2026';
const PREFIX = 'stand-in-';

/** Deliberately obvious. Nobody should ever wonder whether one of these is somebody's cousin. */
const NAMES: [string, string][] = [
  ['Stand-in One', 'Dry Run FC'],
  ['Stand-in Two', 'Placeholder United'],
  ['Stand-in Three', 'The Rehearsals'],
  ['Stand-in Four', 'Test Pattern'],
  ['Stand-in Five', 'Nobody Athletic'],
  ['Stand-in Six', 'Empty Chair XI'],
  ['Stand-in Seven', 'Understudy FC'],
  ['Stand-in Eight', 'Soundcheck Rovers'],
  ['Stand-in Nine', 'Fire Drill City'],
  ['Stand-in Ten', 'Sandbox Wanderers'],
];

const remove = process.argv.includes('--remove');
const withRosters = !process.argv.includes('--no-rosters');
const howMany = Number(process.argv.find((arg) => /^\d+$/.test(arg)) ?? 6);

const db = admin();

/**
 * A repeatable shuffle.
 *
 * Seeded so running this twice with the same field gives the same teams — a bug that only shows up
 * on one particular roster is worth being able to reproduce.
 */
function shuffled<T>(list: readonly T[], seed: number): T[] {
  const out = [...list];
  let state = seed * 2654435761 % 2147483647;
  for (let index = out.length - 1; index > 0; index -= 1) {
    state = (state * 48271) % 2147483647;
    const swap = state % (index + 1);
    [out[index], out[swap]] = [out[swap]!, out[index]!];
  }
  return out;
}

const entries = await db.collection(`contests/${CONTEST}/entries`).get();
const standIns = entries.docs.filter((entry) => entry.id.startsWith(PREFIX));

if (remove) {
  if (standIns.length === 0) {
    console.log('No stand-ins to remove.');
  } else {
    for (const entry of standIns) {
      // A manager's rounds are a subcollection, and deleting a document does not delete those.
      const rounds = await entry.ref.collection('rounds').get();
      for (const round of rounds.docs) await round.ref.delete();
      await entry.ref.delete();
      console.log(`removed ${entry.id}`);
    }
    console.log(`\n${standIns.length} stand-in${standIns.length === 1 ? '' : 's'} gone.`);
  }
  process.exit(0);
}

const contest = (await db.doc(`contests/${CONTEST}`).get()).data();
if (!contest) throw new Error('No contest');
const round = contest.currentRound as number;

const pool = ((await db.doc(`contests/${CONTEST}/pool/current`).get()).data()?.players ?? []) as
  { id: string; name: string; position: string; team: string }[];
const teams = (await db.doc(`contests/${CONTEST}/teams/${round}`).get()).data() as
  { alive: string[]; byes: string[] } | undefined;
const alive = new Set(teams?.alive ?? []);
const byes = new Set(teams?.byes ?? []);

if (withRosters && pool.length === 0) {
  throw new Error('The pool is empty — run seed-pool.ts first, or pass --no-rosters.');
}

const wanted = Math.min(howMany, NAMES.length);
console.log(`Contest ${CONTEST}, round ${round}. ${pool.length} players in the pool.\n`);

for (let index = 0; index < wanted; index += 1) {
  const [name, teamName] = NAMES[index]!;
  const uid = `${PREFIX}${index + 1}`;

  await db.doc(`contests/${CONTEST}/entries/${uid}`).set({
    name,
    teamName,
    logo: '',
    paid: index % 3 !== 0, // A couple unpaid, so the prize pool has something to show.
    stand_in: true,
    joinedAt: new Date(),
  });

  if (!withRosters) {
    console.log(`${teamName.padEnd(22)} entry only`);
    continue;
  }

  // A legal nine: eligible for the slot, on a club still in, nobody picked twice. Shuffled per
  // manager so the field holds different teams and the standings have something to separate.
  const candidates = shuffled(
    pool.filter((player) => alive.has(player.team)),
    index + 1,
  );
  const taken = new Set<string>();
  const players = EASTSIDE.slots.flatMap((slot) => {
    const pick = candidates.find(
      (player) => slot.eligible.includes(player.position as Position) && !taken.has(player.id),
    );
    if (!pick) return [];
    taken.add(pick.id);
    return [{
      playerId: pick.id,
      position: pick.position,
      slot: slot.id,
      onBye: byes.has(pick.team),
    }];
  });

  if (players.length < EASTSIDE.slots.length) {
    console.log(`${teamName.padEnd(22)} only ${players.length} of ${EASTSIDE.slots.length} slots could be filled`);
  }

  await db.doc(`contests/${CONTEST}/entries/${uid}/rounds/${round}`).set({
    players,
    submittedAt: new Date(),
    stand_in: true,
  });

  const named = players.map((held) => pool.find((player) => player.id === held.playerId)?.name ?? '?');
  console.log(`${teamName.padEnd(22)} ${named.join(', ')}`);
}

console.log(`\n${wanted} stand-ins in. Remove them with --remove when real people turn up.`);
