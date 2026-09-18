import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { whenPicked } from '../src/domain/standin.ts';

const LOCK = new Date('2026-09-17T17:15:00');
const DAY = 24 * 60 * 60 * 1000;

describe('when a stand-in would have picked', () => {
  it('lands in the days before the lock and never after it', () => {
    for (const uid of ['aaa', 'zzz', 'Qy5wAVWRAlMj9sjVv1wU3MS8pOv1', '1']) {
      const at = whenPicked(uid, 0, LOCK);
      assert.ok(at < LOCK, `${uid} picked after the lock`);
      assert.ok(at.getTime() > LOCK.getTime() - 5 * DAY, `${uid} picked absurdly early`);
    }
  });

  it('gives the same answer every time, so a rerender does not move it', () => {
    assert.equal(
      whenPicked('abc', 1, LOCK).getTime(),
      whenPicked('abc', 1, LOCK).getTime(),
    );
  });

  it('separates managers, which is the entire point', () => {
    // All six stamped the same second is six managers who are one person pressing a button.
    const times = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot']
      .map((uid) => whenPicked(uid, 0, LOCK).getTime());
    assert.equal(new Set(times).size, times.length);
  });

  it('moves a manager between rounds rather than pinning him to one habit', () => {
    assert.notEqual(whenPicked('abc', 0, LOCK).getTime(), whenPicked('abc', 1, LOCK).getTime());
  });
});

describe('and at an hour somebody would be awake', () => {
  it('never lands in the small hours', () => {
    // A uniform scatter across the clock is not a spread, it is a different tell from the one
    // being fixed: three of six managers picking at four in the morning.
    for (const uid of ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel']) {
      for (const round of [0, 1, 2, 3]) {
        const hour = whenPicked(uid, round, LOCK).getHours();
        assert.ok(hour >= 8 && hour <= 22, `${uid} round ${round} picked at ${hour}:00`);
      }
    }
  });
});
