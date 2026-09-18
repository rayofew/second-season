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

  it('counts nothing as scored before anybody has kicked off', () => {
    // A row reading 140 on a Sunday morning is telling somebody he has 140 points. He has none.
    const rows = board([entry('hopeful', 0, [man('QB', 0, 1, 'upcoming', 24)])], 'contest');
    assert.equal(rows[0]?.total, 24, 'expected');
    assert.equal(rows[0]?.scored, 0, 'and actually scored');
  });

  it('counts a man whose game is under way, finished or not', () => {
    const rows = board([entry('playing', 0, [
      man('QB', 18, 2, 'final'),
      man('RB1', 7, 1, 'playing'),
      man('RB2', 0, 1, 'upcoming', 12),
    ])], 'contest');
    assert.equal(rows[0]?.scored, 36 + 7, 'the finished man and the one on the field');
    assert.equal(rows[0]?.total, 36 + 7 + 12, 'and the one still to come, at his projection');
  });

  it('carries previous rounds into what has been scored, since they are real', () => {
    const rows = board([entry('carried', 300, [man('QB', 0, 1, 'upcoming', 20)])], 'contest');
    assert.equal(rows[0]?.scored, 300);
    assert.equal(rows[0]?.total, 320);
  });

  it('scores the week on raw points from games under way', () => {
    const rows = board([entry('week', 999, [
      man('QB', 20, 4, 'final'),
      man('RB1', 0, 1, 'upcoming', 9),
    ])], 'week');
    assert.equal(rows[0]?.scored, 20, 'raw, and nothing carried in');
    assert.equal(rows[0]?.total, 29);
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

  it('orders by what has been scored, not by what is expected', () => {
    // The board read 52, then 17, then 34 down the page, because it was sorted on projections
    // and displaying the real figure. Whatever the big number is, the order has to follow it.
    const rows = board([
      entry('hyped', 0, [man('QB', 17, 1, 'playing'), man('RB1', 0, 1, 'upcoming', 134)]),
      entry('scoring', 0, [man('QB', 52, 1, 'playing'), man('RB1', 0, 1, 'upcoming', 20)]),
    ], 'contest');
    assert.deepEqual(rows.map((row) => row.entryId), ['scoring', 'hyped']);
    assert.equal(rows[0]?.behind, 0);
    assert.equal(rows[1]?.behind, 35, 'and behind is measured in real points too');
  });

  it('reads in projection order while everybody is still on nought', () => {
    // Nobody has kicked off, so nobody is ahead of anybody — but the list still has to come out
    // in some order, and the most promising afternoon is the useful one to put at the top.
    const rows = board([
      entry('quiet', 0, [man('QB', 0, 1, 'upcoming', 40)]),
      entry('loaded', 0, [man('QB', 0, 1, 'upcoming', 120)]),
    ], 'contest');
    assert.deepEqual(rows.map((row) => row.entryId), ['loaded', 'quiet']);
    assert.deepEqual(rows.map((row) => row.rank), [1, 1], 'level, and said to be level');
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
