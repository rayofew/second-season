import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collected, payouts, placesFor } from '../src/domain/pool.ts';

describe('the prize pool', () => {
  it('pays more places as the field grows', () => {
    // Paying three out of twenty leaves most of the room with nothing to play for by round three.
    assert.equal(placesFor(6), 2);
    assert.equal(placesFor(10), 3);
    assert.equal(placesFor(16), 4);
    assert.equal(placesFor(20), 5);
    assert.equal(placesFor(40), 5, 'and stops there rather than paying half the room');
  });

  it('splits the pot steeply enough that winning beats placing', () => {
    const split = payouts(10, 20);
    assert.deepEqual(split.map((entry) => entry.amount), [100, 60, 40]);
    assert.equal(split.reduce((sum, entry) => sum + entry.amount, 0), 200, 'and adds up to the pot');
  });

  it('handles a bigger field', () => {
    const split = payouts(20, 20);
    assert.equal(split.length, 5);
    assert.equal(split[0]!.amount, 160);
    assert.equal(split.reduce((sum, entry) => sum + entry.amount, 0), 400);
  });

  it('separates what is in hand from what the field is worth', () => {
    // Seven of ten have paid: the pot is still worth 200, but only 140 exists.
    assert.equal(collected(7, 20), 140);
    assert.equal(payouts(10, 20)[0]!.amount, 100);
  });

  it('survives a contest nobody has set a buy-in for', () => {
    assert.deepEqual(payouts(10, 0).map((entry) => entry.amount), [0, 0, 0]);
  });
});
