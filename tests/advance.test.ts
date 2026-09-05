import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decide, reseed } from '../src/domain/advance.ts';
import type { Field } from '../src/domain/advance.ts';

const FIELD: Field = {
  DEN: { conference: 'AFC', seed: 1 }, NE: { conference: 'AFC', seed: 2 },
  JAX: { conference: 'AFC', seed: 3 }, PIT: { conference: 'AFC', seed: 4 },
  BUF: { conference: 'AFC', seed: 5 },
  SEA: { conference: 'NFC', seed: 1 }, PHI: { conference: 'NFC', seed: 2 },
  CHI: { conference: 'NFC', seed: 3 }, TB: { conference: 'NFC', seed: 4 },
};

const points = (table: Record<string, number>) => (club: string) => table[club] ?? 0;
const yards = (table: Record<string, number>) => (club: string) => table[club] ?? 0;

describe('deciding a round', () => {
  it('sends through whoever scored more in their own fixture', () => {
    const result = decide({ home: 'PIT', away: 'BUF', winner: null }, points({ PIT: 17, BUF: 30 }), yards({}), FIELD);
    assert.equal(result.winner, 'BUF');
    assert.equal(result.why, 'BUF 30, PIT 17', 'names both clubs, because "17-30" beside "BUF at PIT" is ambiguous');
  });

  it('falls to passing yards when the points are equal', () => {
    const result = decide({ home: 'NE', away: 'JAX', winner: null }, points({ NE: 24, JAX: 24 }), yards({ NE: 210, JAX: 288 }), FIELD);
    assert.equal(result.winner, 'JAX');
    assert.match(result.why, /both 24/);
  });

  it('falls to the better seed when everything else is level', () => {
    const result = decide({ home: 'JAX', away: 'BUF', winner: null }, points({ JAX: 20, BUF: 20 }), yards({ JAX: 250, BUF: 250 }), FIELD);
    assert.equal(result.winner, 'JAX', 'seed 3 beats seed 5');
  });

  it('never returns without a winner', () => {
    // Two clubs that did nothing at all still have to be separated.
    const result = decide({ home: 'DEN', away: 'NE', winner: null }, points({}), yards({}), FIELD);
    assert.equal(result.winner, 'DEN');
  });
});

describe('reseeding', () => {
  it('pairs the best surviving seed with the worst, inside each conference', () => {
    const pairs = reseed(['DEN', 'PIT', 'NE', 'JAX', 'SEA', 'TB', 'PHI', 'CHI'], FIELD);
    assert.deepEqual(
      pairs.map((pair) => `${pair.away} at ${pair.home}`),
      ['PIT at DEN', 'JAX at NE', 'TB at SEA', 'CHI at PHI'],
    );
  });

  it('puts the last two together whatever conferences they came from', () => {
    // The only time the two halves of the bracket touch.
    const pairs = reseed(['DEN', 'SEA'], FIELD);
    assert.equal(pairs.length, 1);
    assert.deepEqual([pairs[0]!.home, pairs[0]!.away].sort(), ['DEN', 'SEA']);
  });

  it('handles a conference with an odd number left', () => {
    // Three survivors pair the top with the bottom and leave the middle one over, which is what a
    // bye is — better that than inventing a fixture nobody can play.
    const pairs = reseed(['DEN', 'NE', 'JAX'], FIELD);
    assert.deepEqual(pairs.map((pair) => `${pair.away} at ${pair.home}`), ['JAX at DEN']);
  });
});
