import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { caption } from '../src/domain/gameclock.ts';

describe('where a game has got to', () => {
  it('says Half at the interval rather than a stopped clock', () => {
    // The whole reason this function exists. Period 2, clock 0:00 — assembled naively that reads
    // "Q2 0:00", which looks like a game that has broken rather than one at half time.
    assert.equal(
      caption({ state: 'playing', name: 'STATUS_HALFTIME', period: 2, displayClock: '0:00' }),
      'Half',
    );
  });

  it('names the quarter that has just ended between periods', () => {
    assert.equal(
      caption({ state: 'playing', name: 'STATUS_END_PERIOD', period: 1, displayClock: '0:00' }),
      'End 1st',
    );
    assert.equal(
      caption({ state: 'playing', name: 'STATUS_END_PERIOD', period: 3, displayClock: '0:00' }),
      'End 3rd',
    );
  });

  it('reads the clock while the game is running', () => {
    assert.equal(
      caption({ state: 'playing', name: 'STATUS_IN_PROGRESS', period: 2, displayClock: '1:03' }),
      'Q2 1:03',
    );
  });

  it('writes overtime the way it is written', () => {
    assert.equal(
      caption({ state: 'playing', name: 'STATUS_IN_PROGRESS', period: 5, displayClock: '8:12' }),
      'OT 8:12',
    );
    assert.equal(
      caption({ state: 'playing', name: 'STATUS_IN_PROGRESS', period: 6, displayClock: '3:00' }),
      '2OT 3:00',
    );
  });

  it('says Final when it is over, and marks one that went to overtime', () => {
    assert.equal(caption({ state: 'final', name: 'STATUS_FINAL', period: 4 }), 'Final');
    assert.equal(
      caption({ state: 'final', name: 'STATUS_FINAL_OVERTIME', period: 5 }),
      'Final/OT',
    );
  });

  it('says nothing at all before kickoff, where the kickoff time says it better', () => {
    assert.equal(caption({ state: 'upcoming', name: 'STATUS_SCHEDULED' }), '');
  });

  it('names a game that is not going to be played on time', () => {
    // Somebody holding four men from a postponed club should find that out from the screen and
    // not from waiting all afternoon for a chip that never fills in.
    assert.equal(caption({ state: 'upcoming', name: 'STATUS_POSTPONED' }), 'Postponed');
    assert.equal(caption({ state: 'upcoming', name: 'STATUS_DELAYED' }), 'Delayed');
    assert.equal(caption({ state: 'final', name: 'STATUS_CANCELED' }), 'Canceled');
    assert.equal(caption({ state: 'playing', name: 'STATUS_SUSPENDED' }), 'Suspended');
  });

  it('falls back to the state when ESPN sends a status it has never sent before', () => {
    assert.equal(
      caption({ state: 'playing', name: 'STATUS_SOMETHING_NEW', period: 3, displayClock: '12:00' }),
      'Q3 12:00',
    );
    assert.equal(
      caption({ state: 'final', name: 'STATUS_SOMETHING_NEW', shortDetail: 'Final/SO' }),
      'Final/SO',
    );
    assert.equal(caption({ state: 'final', name: 'STATUS_SOMETHING_NEW' }), 'Final');
  });
});
