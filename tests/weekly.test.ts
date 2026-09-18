import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { weeklyWins, winCounts } from '../src/domain/weekly.ts';
import type { EntryScore } from '../src/domain/standings.ts';

const entry = (entryId: string, raws: number[]): EntryScore => ({
  entryId,
  name: entryId,
  rounds: raws.map((raw, round) => ({ round, raw, credited: raw * 2, players: [] })),
  raw: raws.reduce((sum, raw) => sum + raw, 0),
  credited: raws.reduce((sum, raw) => sum + raw, 0) * 2,
});

describe('the weekly prize', () => {
  it('goes on raw points, so being ahead overall counts for nothing', () => {
    // The whole reason the weekly prize exists: a dead contest can still win a Sunday.
    const wins = weeklyWins([entry('runaway', [200]), entry('dead', [210])]);
    assert.deepEqual(wins[0]?.winners.map((winner) => winner.entryId), ['dead']);
    assert.equal(wins[0]?.raw, 210);
  });

  it('shares a dead heat rather than breaking it', () => {
    const wins = weeklyWins([entry('a', [140]), entry('b', [140]), entry('c', [90])]);
    assert.deepEqual(wins[0]?.winners.map((winner) => winner.entryId), ['a', 'b']);
  });

  it('gives a week nobody has played no winner at all', () => {
    // The screen asks for every round, including the one that kicks off on Sunday.
    const wins = weeklyWins([entry('a', [120, 0]), entry('b', [90, 0])]);
    assert.deepEqual(wins[1]?.winners, []);
    assert.equal(wins[1]?.raw, 0);
  });

  it('counts a week each, including the shared ones', () => {
    const wins = weeklyWins([
      entry('a', [140, 100, 80]),
      entry('b', [140, 90, 200]),
      entry('c', [10, 10, 10]),
    ]);
    const counts = winCounts(wins);
    assert.equal(counts.get('a'), 2, 'the shared first week and the second');
    assert.equal(counts.get('b'), 2, 'the shared first week and the third');
    assert.equal(counts.get('c'), undefined, 'and nothing for nobody');
  });

  it('copes with a contest that has not started', () => {
    assert.deepEqual(weeklyWins([]), []);
    assert.deepEqual(weeklyWins([entry('a', [])]), []);
  });
});
