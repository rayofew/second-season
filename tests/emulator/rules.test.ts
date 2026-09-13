import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

/**
 * The security rules, run against the emulator.
 *
 * Every other test in this project exercises code. These exercise the thing that actually decides
 * what a manager may do — and the one bug that has reached real people got through precisely
 * because nothing here existed: a path segment is a string, currentRound is written as a number,
 * the rules do not coerce between the two, and the comparison was quietly always false. The write
 * then fell through to the commissioner clause, so it worked perfectly for the one person testing
 * it and for nobody else.
 *
 * Needs the emulator, which the npm script starts:
 *
 *   npm run test:rules
 */

const PROJECT = 'second-season-rules';
const CONTEST = 'rehearsal-2026';
const COMMISSIONER = 'commish-uid';
const MANAGER = 'manager-uid';
const STRANGER = 'stranger-uid';

/** An hour from now, so "before the lock" is unambiguous. */
const SOON = new Date(Date.now() + 60 * 60 * 1000);
const PASSED = new Date(Date.now() - 60 * 60 * 1000);

let env: RulesTestEnvironment;

const nine = [{ playerId: 'p1', position: 'QB', slot: 'QB', onBye: false }];

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'contests', CONTEST), {
      name: 'Rules',
      season: 2026,
      // A number, exactly as seed.ts writes it. This is the whole point of the first test.
      currentRound: 0,
      status: 'open',
      commissioners: [COMMISSIONER],
      rounds: [{ round: 0, name: 'Wild Card', week: 2 }, { round: 1, name: 'Divisional', week: 3 }],
      locks: { '0': SOON, '1': SOON },
    });
    await setDoc(doc(db, 'contests', CONTEST, 'entries', MANAGER), { name: 'A Manager', teamName: 'A Team' });
    await setDoc(doc(db, 'contests', CONTEST, 'entries', COMMISSIONER), { name: 'The Commish', teamName: 'His Team' });
  });
});

after(async () => { await env?.cleanup(); });

const asManager = () => env.authenticatedContext(MANAGER).firestore();
const asStranger = () => env.authenticatedContext(STRANGER).firestore();
const asCommissioner = () => env.authenticatedContext(COMMISSIONER).firestore();

describe('submitting a roster', () => {
  it('lets an ordinary manager submit his own team before the lock', async () => {
    // The bug: this failed for everybody who was not a commissioner, and the app told them the
    // round had locked four days early.
    await assertSucceeds(
      setDoc(doc(asManager(), 'contests', CONTEST, 'entries', MANAGER, 'rounds', '0'), { players: nine }),
    );
  });

  it('lets him change it again, because nothing is final until the lock', async () => {
    await assertSucceeds(
      setDoc(doc(asManager(), 'contests', CONTEST, 'entries', MANAGER, 'rounds', '0'), { players: [] }),
    );
  });

  it('refuses a roster for a round that is not the open one', async () => {
    await assertFails(
      setDoc(doc(asManager(), 'contests', CONTEST, 'entries', MANAGER, 'rounds', '1'), { players: nine }),
    );
  });

  it('refuses one manager writing another manager’s team', async () => {
    await assertFails(
      setDoc(doc(asManager(), 'contests', CONTEST, 'entries', COMMISSIONER, 'rounds', '0'), { players: nine }),
    );
  });

  it('refuses somebody who is not in the league at all', async () => {
    await assertFails(
      setDoc(doc(asStranger(), 'contests', CONTEST, 'entries', STRANGER, 'rounds', '0'), { players: nine }),
    );
  });

  it('lets the commissioner write anybody’s team, which is how he fixes one', async () => {
    await assertSucceeds(
      setDoc(doc(asCommissioner(), 'contests', CONTEST, 'entries', MANAGER, 'rounds', '0'), { players: nine }),
    );
  });
});

describe('the lock', () => {
  before(async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'contests', CONTEST), {
        name: 'Rules',
        season: 2026,
        currentRound: 0,
        status: 'open',
        commissioners: [COMMISSIONER],
        rounds: [{ round: 0, name: 'Wild Card', week: 2 }, { round: 1, name: 'Divisional', week: 3 }],
        locks: { '0': PASSED, '1': SOON },
      });
    });
  });

  it('refuses a roster once the round has kicked off', async () => {
    await assertFails(
      setDoc(doc(asManager(), 'contests', CONTEST, 'entries', MANAGER, 'rounds', '0'), { players: nine }),
    );
  });

  it('still lets the commissioner in, so a broken team can be fixed mid-round', async () => {
    await assertSucceeds(
      setDoc(doc(asCommissioner(), 'contests', CONTEST, 'entries', MANAGER, 'rounds', '0'), { players: nine }),
    );
  });
});
