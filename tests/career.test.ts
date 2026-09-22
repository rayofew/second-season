import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { career } from '../src/domain/career.ts';
import type { RawCategory } from '../src/domain/career.ts';

const season = (year: number, ...stats: string[]) => ({ season: { year }, teamSlug: 'buffalo-bills', stats });

const PASSING: RawCategory = {
  name: 'passing',
  labels: ['GP', 'CMP', 'ATT', 'CMP%', 'YDS', 'AVG', 'TD', 'INT', 'LNG', 'SACK', 'RTG', 'QBR'],
  statistics: [
    season(2022, '16', '359', '567', '63.3', '4283', '7.6', '35', '14', '98', '33', '96.6', '77.3'),
    season(2023, '17', '385', '579', '66.5', '4306', '7.4', '29', '18', '81', '24', '92.2', '70.2'),
    season(2024, '17', '307', '483', '63.6', '3731', '7.7', '28', '6', '68', '14', '101.4', '77.4'),
  ],
};

const EMPTY_RECEIVING: RawCategory = {
  name: 'receiving',
  labels: ['GP', 'REC', 'TGTS', 'YDS', 'AVG', 'TD', 'LNG', 'FD', 'FUM', 'LST'],
  statistics: [season(2024, '17', '0', '1', '0', '0.0', '0', '0', '0', '0', '0')],
};

describe('a player\'s last few years', () => {
  it('cuts twelve columns down to the four that decide an afternoon', () => {
    const [passing] = career([PASSING], 'QB');
    assert.deepEqual(passing!.labels, ['GP', 'YDS', 'TD', 'INT']);
    assert.deepEqual(passing!.seasons[0]!.figures, ['17', '3731', '28', '6']);
  });

  it('puts the most recent season at the top, which is the one being argued about', () => {
    const [passing] = career([PASSING], 'QB');
    assert.deepEqual(passing!.seasons.map((row) => row.year), [2024, 2023, 2022]);
  });

  it('shows only as many years back as anybody argues about', () => {
    const many = { ...PASSING, statistics: [2019, 2020, 2021, 2022, 2023, 2024].map((year) => season(year, '17', '1', '2', '3', '4000', '7', '30', '9')) };
    assert.equal(career([many], 'QB')[0]!.seasons.length, 4);
    assert.equal(career([many], 'QB', 2)[0]!.seasons.length, 2);
  });

  it('leaves out a category he has never done anything in', () => {
    // A receiver with an empty passing table is a row of noughts pretending to be information.
    const tables = career([PASSING, EMPTY_RECEIVING], 'QB');
    assert.deepEqual(tables.map((table) => table.name), ['Passing']);
  });

  it('shows each position what it is judged on, in the order the sport says it', () => {
    assert.deepEqual(career([PASSING], 'QB').map((t) => t.name), ['Passing']);
    assert.deepEqual(career([], 'K'), [], 'and nothing at all when ESPN has nothing');
  });

  it('says the club the way somebody would', () => {
    // ESPN writes 'buffalo-bills'. Nobody says that.
    assert.equal(career([PASSING], 'QB')[0]!.seasons[0]!.team, 'Bills');
  });

  it('survives a player ESPN has never heard of', () => {
    assert.deepEqual(career([], 'WR'), []);
    assert.deepEqual(career([{ name: 'passing', labels: [], statistics: [] }], 'QB'), []);
  });
});
