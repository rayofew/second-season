import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickFor, STAND_INS, STAND_IN_PREFIX, tasteOf, uidFor } from '../src/domain/standin.ts';
import type { Candidate } from '../src/domain/standin.ts';
import { EASTSIDE } from '../src/domain/rules.ts';
import type { HeldPlayer } from '../src/domain/multiplier.ts';

/** A small pool: enough of every position to fill nine slots twice over. */
const pool: Candidate[] = [
  ...['q1', 'q2', 'q3'].map((id) => ({ id, position: 'QB', team: id === 'q3' ? 'OUT' : 'SEA' })),
  ...['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => ({ id, position: 'RB', team: id === 'r5' ? 'OUT' : 'NE' })),
  ...['w1', 'w2', 'w3', 'w4', 'w5'].map((id) => ({ id, position: 'WR', team: 'SEA' })),
  ...['t1', 't2'].map((id) => ({ id, position: 'TE', team: 'NE' })),
  ...['k1', 'k2'].map((id) => ({ id, position: 'K', team: 'SEA' })),
  ...['d1', 'd2'].map((id) => ({ id, position: 'DEF', team: id === 'd1' ? 'SEA' : 'NE' })),
];

const alive = new Set(['SEA', 'NE']);
const byes = new Set<string>();
// Lower ids are better, so "the best available" is predictable.
const worth = (player: Candidate) => 100 - Number(player.id.slice(1));

const held = (playerId: string, slot: string): HeldPlayer => ({
  playerId,
  position: (pool.find((player) => player.id === playerId)!.position) as HeldPlayer['position'],
  slot,
  onBye: false,
});

const full = (players: HeldPlayer[]) => players.length === EASTSIDE.slots.length;

describe('stand-in managers', () => {
  it('fills a legal nine from nothing', () => {
    const picked = pickFor('patcher', [], pool, alive, byes, worth);
    assert.ok(full(picked), 'all nine slots');
    assert.equal(new Set(picked.map((p) => p.playerId)).size, 9, 'nobody twice');
    for (const entry of picked) {
      const slot = EASTSIDE.slots.find((candidate) => candidate.id === entry.slot)!;
      assert.ok(slot.eligible.includes(entry.position), `${entry.playerId} may fill ${entry.slot}`);
      const club = pool.find((player) => player.id === entry.playerId)!.team;
      assert.ok(alive.has(club), 'only clubs still in');
    }
  });

  it('keeps everybody when he is loyal', () => {
    const previous = [held('q1', 'QB'), held('r1', 'RB1'), held('w1', 'WR1')];
    const picked = pickFor('loyal', previous, pool, alive, byes, worth);
    for (const was of previous) {
      assert.ok(picked.some((entry) => entry.playerId === was.playerId), `kept ${was.playerId}`);
    }
  });

  it('keeps nobody when he is chasing points', () => {
    const previous = [held('w5', 'WR1'), held('r4', 'RB1')];
    const picked = pickFor('chaser', previous, pool, alive, byes, worth);
    // He drops even survivors, so the two poor players he held are gone in favour of better ones.
    assert.ok(!picked.some((entry) => entry.playerId === 'w5'));
    assert.equal(picked.find((entry) => entry.slot === 'QB')?.playerId, 'q1', 'and takes the best');
  });

  it('replaces only the men who were knocked out', () => {
    // q3 and r5 play for OUT, which is no longer alive.
    const previous = [held('q3', 'QB'), held('r1', 'RB1'), held('r5', 'RB2')];
    const picked = pickFor('patcher', previous, pool, alive, byes, worth);
    assert.equal(picked.find((entry) => entry.slot === 'RB1')?.playerId, 'r1', 'the survivor stays');
    assert.notEqual(picked.find((entry) => entry.slot === 'QB')?.playerId, 'q3', 'the loss is replaced');
    assert.ok(alive.has(pool.find((p) => p.id === picked.find((e) => e.slot === 'QB')!.playerId)!.team));
  });

  it('lets the fiddler go of exactly one man he could have kept', () => {
    const previous = [held('q1', 'QB'), held('r1', 'RB1'), held('w4', 'WR1')];
    const picked = pickFor('fiddler', previous, pool, alive, byes, worth);
    const kept = previous.filter((was) => picked.some((entry) => entry.playerId === was.playerId));
    assert.equal(kept.length, previous.length - 1, 'one fewer than he held');
    assert.ok(!kept.some((entry) => entry.playerId === 'w4'), 'and it is his worst');
  });

  it('has the absent one submit nothing at all', () => {
    assert.deepEqual(pickFor('absent', [], pool, alive, byes, worth), []);
  });

  it('marks a man whose club is resting', () => {
    const resting = new Set(['SEA']);
    const picked = pickFor('patcher', [], pool, alive, resting, worth);
    for (const entry of picked) {
      const club = pool.find((player) => player.id === entry.playerId)!.team;
      assert.equal(entry.onBye, club === 'SEA', `${entry.playerId} bye flag`);
    }
  });

  it('identifies them by uid, since the names no longer give them away', () => {
    // They read as ordinary managers on purpose, so the uid is the only thing that marks one —
    // which makes it the thing removal has to key on, and the thing that must never drift.
    assert.equal(uidFor(0), 'stand-in-1');
    for (const [index] of STAND_INS.entries()) {
      assert.ok(uidFor(index).startsWith(STAND_IN_PREFIX), `uid ${index} is marked`);
    }
  });

  it('does not hand six managers one team between them', () => {
    // Nobody is holding anybody in the opening round, so without a private view of the pool every
    // stand-in ranks it identically and picks the identical nine.
    const teams = [1, 2, 3, 4, 5, 6].map((seed) =>
      pickFor('patcher', [], pool, alive, byes, tasteOf(seed, worth))
        .map((entry) => entry.playerId).join(','));
    assert.ok(new Set(teams).size > 1, `all six picked the same nine: ${teams[0]}`);
  });

  it('gives the same manager the same team twice', () => {
    const once = pickFor('patcher', [], pool, alive, byes, tasteOf(3, worth));
    const again = pickFor('patcher', [], pool, alive, byes, tasteOf(3, worth));
    assert.deepEqual(once, again, 'a field seeded twice is the same field');
  });

  it('still fills every slot legally whatever a manager thinks of the pool', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const picked = pickFor('patcher', [], pool, alive, byes, tasteOf(seed, worth));
      assert.equal(picked.length, EASTSIDE.slots.length, `seed ${seed} filled nine`);
      assert.equal(new Set(picked.map((entry) => entry.playerId)).size, 9, `seed ${seed} picked nobody twice`);
      for (const entry of picked) {
        const slot = EASTSIDE.slots.find((candidate) => candidate.id === entry.slot)!;
        assert.ok(slot.eligible.includes(entry.position), `seed ${seed}: ${entry.slot}`);
      }
    }
  });

  it('gives every one of them a distinct name and team', () => {
    assert.equal(new Set(STAND_INS.map((one) => one.name)).size, STAND_INS.length);
    assert.equal(new Set(STAND_INS.map((one) => one.teamName)).size, STAND_INS.length);
  });
});
