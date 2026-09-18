import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tree } from '../src/domain/tree.ts';
import type { RoundDraw } from '../src/domain/tree.ts';
import type { Field } from '../src/domain/advance.ts';

/** Seven a side, seeded 1 to 7, which is the shape the rehearsal actually runs. */
const FIELD: Field = Object.fromEntries([
  ...['DEN', 'NE', 'BUF', 'PIT', 'HOU', 'JAX', 'LAC'].map((club, index) => [club, { conference: 'AFC', seed: index + 1 }]),
  ...['SEA', 'PHI', 'GB', 'SF', 'CHI', 'TB', 'LAR'].map((club, index) => [club, { conference: 'NFC', seed: index + 1 }]),
]);

const WILD: RoundDraw = {
  byes: ['DEN', 'SEA'],
  matchups: [
    { home: 'NE', away: 'LAC', winner: 'NE' },
    { home: 'BUF', away: 'JAX', winner: 'JAX' },
    { home: 'PIT', away: 'HOU', winner: 'PIT' },
    { home: 'PHI', away: 'LAR', winner: 'PHI' },
    { home: 'GB', away: 'TB', winner: 'GB' },
    { home: 'SF', away: 'CHI', winner: 'SF' },
  ],
};

// Reseeded: DEN(1) v PIT(4), NE(2) v JAX(6) — deliberately not the order the ties were drawn in.
const DIVISIONAL: RoundDraw = {
  matchups: [
    { home: 'DEN', away: 'PIT', winner: null },
    { home: 'NE', away: 'JAX', winner: null },
    { home: 'SEA', away: 'SF', winner: null },
    { home: 'PHI', away: 'GB', winner: null },
  ],
};

describe('the bracket as a tree', () => {
  it('gives every round half as many slots as the one before it', () => {
    const columns = tree([WILD, DIVISIONAL, null, null], FIELD);
    assert.deepEqual(columns.map((column) => column.slots.length), [8, 4, 2, 1]);
  });

  it('puts the two slots that feed a tie directly above and below it', () => {
    // The whole point: the lines are only true if the feeders sit either side of what they feed.
    const columns = tree([WILD, DIVISIONAL, null, null], FIELD);
    const wild = columns[0]!.slots;
    const divisional = columns[1]!.slots;

    for (const [index, tie] of divisional.entries()) {
      if (tie.kind === 'empty') continue;
      const feeders = [wild[index * 2]!, wild[index * 2 + 1]!];
      assert.deepEqual(
        feeders.map((slot) => slot.through).sort(),
        [tie.home, tie.away].sort(),
        `slots ${index * 2} and ${index * 2 + 1} should feed ${tie.home} v ${tie.away}`,
      );
    }
  });

  it('survives the reseeding that makes a fixed tree a lie', () => {
    // PIT won the third Wild Card tie and DEN was resting. Reseeding pairs them, so those two
    // slots have to end up adjacent however far apart they were drawn.
    const columns = tree([WILD, DIVISIONAL, null, null], FIELD);
    const through = columns[0]!.slots.map((slot) => slot.through);
    assert.equal(Math.abs(through.indexOf('DEN') - through.indexOf('PIT')), 1);
    assert.equal(Math.floor(through.indexOf('DEN') / 2), Math.floor(through.indexOf('PIT') / 2));
  });

  it('keeps the conferences in their own halves', () => {
    const columns = tree([WILD, DIVISIONAL, null, null], FIELD);
    const half = columns[0]!.slots.map((slot) => slot.conference);
    assert.deepEqual(half.slice(0, 4), ['AFC', 'AFC', 'AFC', 'AFC']);
    assert.deepEqual(half.slice(4), ['NFC', 'NFC', 'NFC', 'NFC']);
  });

  it('seeds the opening round best first before anything has been decided', () => {
    const columns = tree([{ ...WILD, matchups: WILD.matchups.map((tie) => ({ ...tie, winner: null })) }, null, null, null], FIELD);
    // The club resting is the top seed, so it sits at the top of its conference's half.
    assert.equal(columns[0]!.slots[0]!.home, 'DEN');
    assert.equal(columns[0]!.slots[4]!.home, 'SEA');
  });

  it('gives a round nobody has reached empty slots rather than nothing', () => {
    const columns = tree([WILD, DIVISIONAL, null, null], FIELD);
    assert.deepEqual(columns[2]!.slots.map((slot) => slot.kind), ['empty', 'empty']);
    assert.deepEqual(columns[3]!.slots.map((slot) => slot.kind), ['empty']);
  });

  it('treats a club resting as a slot of its own, since it is in the next round regardless', () => {
    const columns = tree([WILD, DIVISIONAL, null, null], FIELD);
    const rest = columns[0]!.slots.find((slot) => slot.kind === 'bye');
    assert.equal(rest?.home, 'DEN');
    assert.equal(rest?.through, 'DEN', 'a bye goes through by definition');
    assert.equal(rest?.away, '', 'and has nobody opposite');
  });

  it('copes with a bracket that has not been drawn at all', () => {
    const columns = tree([null, null, null, null], FIELD);
    assert.deepEqual(columns.map((column) => column.slots.length), [8, 4, 2, 1]);
    assert.ok(columns.every((column) => column.slots.every((slot) => slot.kind === 'empty')));
  });
});
