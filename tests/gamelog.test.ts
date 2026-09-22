import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gameLog } from '../src/domain/gamelog.ts';
import type { RawLog } from '../src/domain/gamelog.ts';

const RAW: RawLog = {
  displayNames: [
    'Completions', 'Passing Attempts', 'Passing Yards', 'Completion Percentage',
    'Yards Per Pass Attempt', 'Passing Touchdowns', 'Interceptions', 'Longest Pass',
    'Total Sacks', 'Passer Rating', 'Adjusted QBR',
    'Rushing Attempts', 'Rushing Yards', 'Yards Per Rush Attempt', 'Rushing Touchdowns',
  ],
  events: {
    a: { week: 2, atVs: '@', gameResult: 'W', score: '30-10', opponent: { abbreviation: 'NYJ' } },
    b: { week: 1, atVs: 'vs', gameResult: 'L', score: '14-21', opponent: { abbreviation: 'MIA' } },
    post: { week: 1, atVs: '@', opponent: { abbreviation: 'KC' } },
  },
  seasonTypes: [
    {
      displayName: '2025 Regular Season',
      categories: [{
        events: [
          { eventId: 'a', stats: ['20', '31', '248', '64.5', '8.0', '3', '0', '45', '2', '121.4', '91.7', '14', '69', '4.9', '2'] },
          { eventId: 'b', stats: ['18', '30', '190', '60.0', '6.3', '1', '2', '30', '3', '70.1', '40.0', '5', '12', '2.4', '0'] },
        ],
      }],
    },
    {
      displayName: '2025 Postseason',
      categories: [{ events: [{ eventId: 'post', stats: Array(15).fill('9') }] }],
    },
  ],
};

describe('a season week by week', () => {
  it('picks columns by full name, because the short ones repeat', () => {
    // 'YDS' means passing in one column and rushing six along; 'TD' likewise. Matching the short
    // label would quietly show a quarterback his rushing yards under Passing.
    const log = gameLog(RAW, 'QB');
    assert.deepEqual(log.labels, ['PASS', 'TD', 'INT', 'RUSH', 'TD']);
    assert.deepEqual(log.games[1]!.figures, ['248', '3', '0', '69', '2']);
  });

  it('runs from week one down the page, the way a season happened', () => {
    assert.deepEqual(gameLog(RAW, 'QB').games.map((game) => game.week), [1, 2]);
  });

  it('says where it was played the way somebody would', () => {
    const [first, second] = gameLog(RAW, 'QB').games;
    assert.equal(first!.against, 'vs MIA');
    assert.equal(second!.against, 'at NYJ');
    assert.equal(second!.result, 'W 30-10');
  });

  it('leaves the postseason out rather than showing two week ones', () => {
    // ESPN numbers the postseason from one again, and two week threes in a table is worse than
    // leaving out three games nobody asked about.
    assert.equal(gameLog(RAW, 'QB').games.length, 2);
  });

  it('drops a game ESPN files without a week', () => {
    const odd: RawLog = { ...RAW, events: { a: { opponent: { abbreviation: 'NYJ' } } } };
    assert.deepEqual(gameLog(odd, 'QB').games, []);
  });

  it('shows a tight end what a receiver is shown', () => {
    const receiving: RawLog = {
      displayNames: ['Receptions', 'Receiving Targets', 'Receiving Yards', 'Receiving Touchdowns'],
      events: { a: { week: 1, atVs: 'vs', opponent: { abbreviation: 'GB' } } },
      seasonTypes: [{ displayName: 'Regular', categories: [{ events: [{ eventId: 'a', stats: ['8', '11', '110', '1'] }] }] }],
    };
    assert.deepEqual(gameLog(receiving, 'TE').labels, ['REC', 'TGT', 'YDS', 'TD']);
  });

  it('gives nothing rather than nonsense when ESPN has nothing', () => {
    assert.deepEqual(gameLog({}, 'QB'), { labels: [], games: [] });
  });
});
