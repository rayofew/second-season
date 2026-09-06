import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { liveRoster } from '../src/domain/live.ts';
import type { LiveInput } from '../src/domain/live.ts';

const player = (over: Partial<LiveInput> = {}): LiveInput => ({
  playerId: 'x', slot: 'QB', multiplier: 1, raw: 0, projected: 0, state: 'upcoming', ...over,
});

describe('a roster while the football is on', () => {
  it('carries a man who has not kicked off at his projection', () => {
    // Otherwise the screen reads nothing all morning and everything at once on Sunday night.
    const live = liveRoster([player({ projected: 18, state: 'upcoming' })]);
    assert.equal(live.players[0]!.counting, 18);
    assert.equal(live.running, 18);
    assert.equal(live.banked, 0, 'a projection is not banked');
  });

  it('drops the projection the moment his game starts', () => {
    // A projection is a guess about a game nobody has watched. Once there is a real number the
    // guess stops being interesting, even when the real number is worse.
    const live = liveRoster([player({ raw: 3, projected: 18, state: 'playing' })]);
    assert.equal(live.players[0]!.counting, 3);
    assert.equal(live.playing, 1);
  });

  it('applies the multiplier to whichever figure is counting', () => {
    const live = liveRoster([
      player({ slot: 'QB', raw: 0, projected: 20, state: 'upcoming', multiplier: 3 }),
      player({ slot: 'RB1', raw: 12, projected: 9, state: 'final', multiplier: 2 }),
    ]);
    assert.deepEqual(live.players.map((entry) => entry.credited), [60, 24]);
    assert.equal(live.running, 84);
    assert.equal(live.banked, 24, 'only the finished game is banked');
  });

  it('counts what is still to come', () => {
    const live = liveRoster([
      player({ state: 'upcoming' }),
      player({ state: 'upcoming' }),
      player({ state: 'playing' }),
      player({ state: 'final' }),
    ]);
    assert.equal(live.yetToPlay, 2);
    assert.equal(live.playing, 1);
  });

  it('handles a man whose club is out, who has neither points nor a projection', () => {
    const live = liveRoster([player({ raw: 0, projected: 0, state: 'final', multiplier: 4 })]);
    assert.equal(live.running, 0, 'four times nothing is still nothing');
  });
});
