import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scoreEntry, table } from '../src/domain/standings.ts';
import type { Contest, Entry } from '../src/domain/standings.ts';
import { EASTSIDE } from '../src/domain/rules.ts';
import type { Tiebreaker } from '../src/domain/rules.ts';
import type { StatLine } from '../src/domain/scoring.ts';

/**
 * Each manager holds one running back for all four rounds, so his multiplier runs 1x, 2x, 3x, 4x
 * and the round he scored in is the only thing that varies. Rushing yards are ten to the point,
 * which makes every expected total in here arithmetic anyone can check.
 */
interface Sketch {
  name: string;
  raw: number[];
  prediction?: number;
  commissionerRank?: number;
}

function contestOf(managers: Sketch[]) {
  const entries: Entry[] = managers.map((manager) => ({
    entryId: manager.name,
    name: manager.name,
    prediction: manager.prediction,
    commissionerRank: manager.commissionerRank,
    history: manager.raw.map(() => [{ playerId: manager.name, position: 'RB' as const, slot: 'RB1' }]),
  }));

  const statsByRound: Record<string, StatLine>[] = [0, 1, 2, 3].map((round) =>
    Object.fromEntries(managers.map((manager) => [manager.name, { rush_yd: manager.raw[round]! * 10 }])),
  );

  const contest: Contest = { statsByRound };
  return { entries, contest };
}

const names = (placings: { name: string }[]) => placings.map((placing) => placing.name);

describe('the table', () => {
  it('adds a manager up round by round, multiplying only after the fact', () => {
    const { entries, contest } = contestOf([{ name: 'A', raw: [10, 10, 10, 10] }]);
    const score = scoreEntry(entries[0]!, contest);

    assert.deepEqual(score.rounds.map((round) => round.credited), [10, 20, 30, 40]);
    assert.equal(score.raw, 40, 'forty raw points');
    assert.equal(score.credited, 100, 'worth a hundred once held all the way');
    assert.deepEqual(score.rounds.map((round) => round.players[0]!.multiplier), [1, 2, 3, 4]);
  });

  it('ranks by credited points, not raw', () => {
    const { entries, contest } = contestOf([
      { name: 'Late', raw: [5, 5, 5, 25] },
      { name: 'Early', raw: [25, 5, 5, 5] },
    ]);
    const placings = table(entries, contest);
    assert.deepEqual(names(placings), ['Late', 'Early']);
    assert.equal(placings[0]!.credited, 5 + 10 + 15 + 100);
    assert.equal(placings[0]!.raw, placings[1]!.raw, 'on identical raw totals');
  });
});

describe('breaking a dead heat', () => {
  it('gives it to the bigger Super Bowl round', () => {
    const { entries, contest } = contestOf([
      { name: 'Faded', raw: [40, 10, 10, 5] },
      { name: 'Finished', raw: [10, 10, 10, 12.5] },
    ]);
    const placings = table(entries, contest);
    assert.equal(placings[0]!.credited, placings[1]!.credited, 'level on points');
    assert.deepEqual(names(placings), ['Finished', 'Faded']);
    assert.equal(placings[1]!.decidedBy, 'roundScore');
    assert.deepEqual([placings[0]!.rank, placings[1]!.rank], [1, 2]);
  });

  it('falls through to the Conference round when the Super Bowl was level too', () => {
    const { entries, contest } = contestOf([
      { name: 'Strong Conference', raw: [40, 10, 15, 5] },
      { name: 'Strong Wild Card', raw: [55, 10, 10, 5] },
    ]);
    const placings = table(entries, contest);
    assert.equal(placings[0]!.credited, placings[1]!.credited);
    assert.equal(placings[0]!.rounds[3]!.credited, placings[1]!.rounds[3]!.credited, 'and level in the final');
    assert.deepEqual(names(placings), ['Strong Conference', 'Strong Wild Card']);
  });

  it('then on raw points, which rewards the man who needed less help', () => {
    const { entries, contest } = contestOf([
      { name: 'More Raw', raw: [20, 10, 10, 5] },
      { name: 'Less Raw', raw: [10, 15, 10, 5] },
    ]);
    const placings = table(entries, contest);
    assert.equal(placings[0]!.credited, placings[1]!.credited);
    assert.deepEqual(names(placings), ['More Raw', 'Less Raw']);
    assert.equal(placings[1]!.decidedBy, 'rawPoints');
  });
});

describe('breaking a dead heat, continued', () => {
  it('then on the guess at the Super Bowl total', () => {
    const { entries, contest } = contestOf([
      { name: 'Close', raw: [10, 10, 10, 5], prediction: 48 },
      { name: 'Wild', raw: [10, 10, 10, 5], prediction: 60 },
    ]);
    const placings = table(entries, { ...contest, superBowlTotal: 50 });
    assert.deepEqual(names(placings), ['Close', 'Wild']);
    assert.equal(placings[1]!.decidedBy, 'prediction');
  });

  it('does not let a manager who never guessed win the guessing tiebreaker', () => {
    const { entries, contest } = contestOf([
      { name: 'Silent', raw: [10, 10, 10, 5] },
      { name: 'Guessed Badly', raw: [10, 10, 10, 5], prediction: 200 },
    ]);
    const placings = table(entries, { ...contest, superBowlTotal: 50 });
    assert.deepEqual(names(placings), ['Guessed Badly', 'Silent'], 'a wild guess still beats no guess');
  });

  it('shares the rank when nothing can separate them', () => {
    const { entries, contest } = contestOf([
      { name: 'A', raw: [10, 10, 10, 5] },
      { name: 'B', raw: [10, 10, 10, 5] },
    ]);
    const placings = table(entries, contest);
    assert.deepEqual([placings[0]!.rank, placings[1]!.rank], [1, 1]);
    assert.equal(placings[1]!.decidedBy, null, 'and nothing is credited with deciding it');
  });

  it('lets the commissioner settle it, when he has said how', () => {
    const { entries, contest } = contestOf([
      { name: 'Second', raw: [10, 10, 10, 5], commissionerRank: 2 },
      { name: 'First', raw: [10, 10, 10, 5], commissionerRank: 1 },
    ]);
    const placings = table(entries, contest);
    assert.deepEqual(names(placings), ['First', 'Second']);
    assert.equal(placings[1]!.decidedBy, 'commissioner');
  });

  it('follows whatever order the league configured, not this one', () => {
    const { entries, contest } = contestOf([
      { name: 'Faded', raw: [40, 10, 10, 5] },
      { name: 'Finished', raw: [10, 10, 10, 12.5] },
    ]);
    assert.deepEqual(names(table(entries, contest)), ['Finished', 'Faded'], 'Super Bowl first by default');

    const rawFirst: readonly Tiebreaker[] = [{ kind: 'rawPoints' }, { kind: 'roundScore', round: 3 }];
    assert.deepEqual(
      names(table(entries, contest, { ...EASTSIDE, tiebreakers: rawFirst })),
      ['Faded', 'Finished'],
      'and the other way round when the league says so',
    );
  });
});

describe('a scoring correction', () => {
  it('rewrites every round and every total, because nothing was stored', () => {
    const { entries, contest } = contestOf([
      { name: 'Wronged', raw: [10, 10, 10, 10] },
      { name: 'Leader', raw: [10, 10, 10, 12] },
    ]);
    assert.deepEqual(names(table(entries, contest)), ['Leader', 'Wronged']);

    const corrected: Contest = {
      ...contest,
      statsByRound: contest.statsByRound.map((round, index) =>
        index === 1 ? { ...round, Wronged: { rush_yd: 150 } } : round,
      ),
    };

    const after = table(entries, corrected);
    assert.deepEqual(names(after), ['Wronged', 'Leader'], 'the lead changes hands');
    assert.equal(after[0]!.rounds[1]!.credited, 30, 'the round itself is restated');
    assert.equal(after[0]!.credited, 10 + 30 + 30 + 40, 'and so is the cumulative total');
  });
});

describe('a correction by hand', () => {
  it('replaces the imported figure and moves the table', () => {
    const { entries, contest } = contestOf([
      { name: 'Wronged', raw: [10, 10, 10, 10] },
      { name: 'Leader', raw: [10, 10, 10, 12] },
    ]);
    assert.deepEqual(names(table(entries, contest)), ['Leader', 'Wronged']);

    // The commissioner finds the Divisional round short and sets it by hand.
    const corrected: Contest = { ...contest, correctionsByRound: [{}, { Wronged: 30 }, {}, {}] };
    const after = table(entries, corrected);
    assert.deepEqual(names(after), ['Wronged', 'Leader'], 'the lead changes hands');
    assert.equal(after[0]!.rounds[1]!.credited, 60, '30 raw at 2x');
  });

  it('keeps what the import said beside what it was changed to', () => {
    // "The provider said 10 and I made it 30" is a different fact from "it was always 30".
    const { entries, contest } = contestOf([{ name: 'A', raw: [10, 10, 10, 10] }]);
    const score = scoreEntry(entries[0]!, { ...contest, correctionsByRound: [{ A: 30 }] });
    assert.equal(score.rounds[0]!.players[0]!.raw, 30);
    assert.equal(score.rounds[0]!.players[0]!.imported, 10);
    assert.equal(score.rounds[0]!.players[0]!.corrected, true);
  });

  it('leaves everybody else alone', () => {
    const { entries, contest } = contestOf([
      { name: 'A', raw: [10, 10, 10, 10] },
      { name: 'B', raw: [10, 10, 10, 10] },
    ]);
    const after = table(entries, { ...contest, correctionsByRound: [{ A: 25 }] });
    assert.equal(after.find((placing) => placing.name === 'B')!.rounds[0]!.credited, 10);
  });

  it('can correct a figure downwards, including to nothing', () => {
    const { entries, contest } = contestOf([{ name: 'A', raw: [20, 0, 0, 0] }]);
    const score = scoreEntry(entries[0]!, { ...contest, correctionsByRound: [{ A: 0 }] });
    assert.equal(score.rounds[0]!.credited, 0, 'zero is a correction, not a missing one');
  });
});
