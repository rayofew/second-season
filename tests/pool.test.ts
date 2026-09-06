import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collected, defaultShares, placesFor, pot } from '../src/domain/pool.ts';
import type { Prizes } from '../src/domain/pool.ts';

const prizes = (over: Partial<Prizes> = {}): Prizes =>
  ({ buyIn: 20, places: null, shares: null, weekly: 0, ...over });

describe('the prize pool', () => {
  it('pays more places as the field grows', () => {
    // Paying three out of twenty leaves most of the room with nothing to play for by round three.
    assert.equal(placesFor(6), 2);
    assert.equal(placesFor(10), 3);
    assert.equal(placesFor(16), 4);
    assert.equal(placesFor(20), 5);
    assert.equal(placesFor(40), 5, 'and stops there rather than paying half the room');
  });

  it('splits the pot steeply, and exactly', () => {
    const result = pot(10, prizes(), 4);
    assert.deepEqual(result.payouts.map((payout) => payout.amount), [100, 60, 40]);
    assert.equal(result.payouts.reduce((sum, payout) => sum + payout.amount, 0), 200);
  });

  it('takes the weekly prizes off the top', () => {
    // Four rounds at ten dollars is forty out of two hundred, and the places divide what is left.
    const result = pot(10, prizes({ weekly: 10 }), 4);
    assert.equal(result.total, 200);
    assert.equal(result.weekly, 40);
    assert.equal(result.places, 160);
    assert.deepEqual(result.payouts.map((payout) => payout.amount), [80, 48, 32]);
  });

  it('takes a hand-written split as given', () => {
    const result = pot(10, prizes({ places: 2, shares: [70, 30] }), 4);
    assert.deepEqual(result.payouts.map((payout) => payout.amount), [140, 60]);
  });

  it('still divides the pot when the shares do not add to a hundred', () => {
    // Somebody mid-edit should see a sensible table, not money invented or lost.
    const result = pot(10, prizes({ places: 2, shares: [7, 3] }), 4);
    assert.deepEqual(result.payouts.map((payout) => payout.amount), [140, 60]);
  });

  it('never promises more in weekly prizes than exists', () => {
    const result = pot(2, prizes({ buyIn: 5, weekly: 100 }), 4);
    assert.equal(result.total, 10);
    assert.equal(result.weekly, 10);
    assert.equal(result.places, 0);
  });

  it('separates what is in hand from what the field is worth', () => {
    assert.equal(collected(7, 20), 140);
    assert.equal(pot(10, prizes(), 4).total, 200);
  });

  it('offers a sensible default shape for any number of places', () => {
    assert.deepEqual(defaultShares(3), [50, 30, 20]);
    assert.equal(defaultShares(5).reduce((sum, share) => sum + share, 0), 100);
  });
});
