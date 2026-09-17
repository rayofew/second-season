import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { board } from '../src/domain/board.ts';
import type { BoardInput } from '../src/domain/board.ts';
import { liveRoster } from '../src/domain/live.ts';
import type { ClubState, LiveInput } from '../src/domain/live.ts';

const man = (
  slot: string,
  raw: number,
  multiplier: number,
  state: ClubState,
  projected = raw,
): LiveInput => ({ playerId: slot, slot, multiplier, raw, projected, state });

const entry = (entryId: string, before: number, men: LiveInput[]): BoardInput => ({
  entryId,
  name: entryId,
  before,
  players: liveRoster(men).players,
});

describe('the live leaderboard', () => {
  it('ranks the contest on credited points carried forward', () => {
    const rows = board([
      // Behind this round, but a long way ahead overall.
      entry('carried', 300, [man('QB', 10, 1, 'final')]),
      entry('surging', 0, [man('QB', 40, 3, 'final')]),
    ], 'contest');
    assert.deepEqual(rows.map((row) => row.entryId), ['carried', 'surging']);
    assert.equal(rows[0]?.total, 310);
    assert.equal(rows[1]?.behind, 190);
  });

  it('ranks the week on raw points, multipliers ignored', () => {
    // The whole reason the weekly prize exists: a dead contest can still win a Sunday.
    const rows = board([
      entry('dead', 0, [man('QB', 40, 1, 'final')]),
      entry('leader', 500, [man('QB', 20, 4, 'final')]),
    ], 'week');
    assert.deepEqual(rows.map((row) => row.entryId), ['dead', 'leader']);
    assert.equal(rows[0]?.raw, 40, 'forty raw beats eighty credited');
  });

  it('separates what is banked from what is only expected', () => {
    const rows = board([
      entry('safe', 0, [man('QB', 30, 1, 'final'), man('RB1', 20, 1, 'final')]),
      entry('hoping', 0, [man('QB', 30, 1, 'final'), man('RB1', 0, 1, 'upcoming', 20)]),
    ], 'contest');
    const [safe, hoping] = rows;
    assert.equal(safe?.total, hoping?.total, 'the same number on the leaderboard');
    assert.equal(safe?.banked, 50);
    assert.equal(hoping?.banked, 30, 'and a very different afternoon');
    assert.equal(hoping?.left, 1);
  });

  it('counts a roster by what its men are doing', () => {
    const rows = board([
      entry('mixed', 0, [
        man('QB', 20, 1, 'final'),
        man('RB1', 8, 1, 'playing'),
        man('RB2', 0, 1, 'upcoming', 12),
        man('WR1', 0, 1, 'upcoming', 9),
      ]),
    ], 'contest');
    assert.deepEqual(
      [rows[0]?.done, rows[0]?.playing, rows[0]?.left],
      [1, 1, 2],
    );
  });

  it('measures how settled a total is against this round, not the whole contest', () => {
    // Somebody carrying 400 in should not show as 95% settled on a Sunday morning.
    const rows = board([
      entry('carrying', 400, [man('QB', 10, 1, 'final'), man('RB1', 0, 1, 'upcoming', 10)]),
    ], 'contest');
    assert.equal(rows[0]?.settled, 0.5);
  });

  it('shares a rank between equal totals and skips the next', () => {
    const rows = board([
      entry('a', 0, [man('QB', 20, 1, 'final')]),
      entry('b', 0, [man('QB', 20, 1, 'final')]),
      entry('c', 0, [man('QB', 10, 1, 'final')]),
    ], 'contest');
    assert.deepEqual(rows.map((row) => row.rank), [1, 1, 3]);
  });

  it('invents no order between two managers who are level', () => {
    // The contest has tiebreakers and they are settled figures applied at the end. Separating
    // people mid-afternoon would show a gap that does not exist.
    const rows = board([
      entry('a', 0, [man('QB', 20, 1, 'final')]),
      entry('b', 0, [man('QB', 20, 1, 'final')]),
    ], 'contest');
    assert.equal(rows[0]?.behind, 0);
    assert.equal(rows[1]?.behind, 0);
  });

  it('copes with a manager who submitted nothing', () => {
    const rows = board([
      entry('absent', 120, []),
      entry('present', 0, [man('QB', 20, 1, 'final')]),
    ], 'contest');
    const absent = rows.find((row) => row.entryId === 'absent');
    assert.equal(absent?.running, 0);
    assert.equal(absent?.settled, 0, 'nothing to be settled about');
    assert.equal(absent?.total, 120, 'he still has what he already had');
  });
});
