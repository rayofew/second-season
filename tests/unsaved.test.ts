import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { changed } from '../src/domain/unsaved.ts';
import type { HeldPlayer } from '../src/domain/multiplier.ts';

const held = (slot: string, playerId: string): HeldPlayer =>
  ({ slot, playerId, position: 'RB' });

const NINE = [held('QB', '1'), held('RB1', '2'), held('FLEX', '3')];

describe('whether a lineup has been changed since it was sent', () => {
  it('says no when nothing has moved', () => {
    assert.equal(changed(NINE, NINE), false);
    assert.equal(changed([...NINE], [...NINE]), false, 'a copy is not a change');
  });

  it('says no when the same nine come back in a different order', () => {
    // Somebody who swaps two men and swaps them back has changed nothing, and being warned about
    // leaving a page he has not altered teaches him to ignore the warning.
    assert.equal(changed([...NINE].reverse(), NINE), false);
  });

  it('says yes when a man is replaced', () => {
    assert.equal(changed([held('QB', '9'), ...NINE.slice(1)], NINE), true);
  });

  it('says yes when the same man moves slot', () => {
    // The nine names are identical and it is still a change: the multiplier and the scoring both
    // follow the slot, not the man.
    assert.equal(changed([held('RB2', '3'), ...NINE.slice(0, 2)], NINE), true);
  });

  it('says yes when a slot is emptied or filled', () => {
    assert.equal(changed(NINE.slice(0, 2), NINE), true);
    assert.equal(changed([...NINE, held('K', '4')], NINE), true);
  });

  it('says nothing has changed about two empty lineups', () => {
    assert.equal(changed([], []), false);
  });
});
