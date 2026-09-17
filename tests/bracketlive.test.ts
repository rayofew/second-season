import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { liveTie, whyLeading } from '../src/domain/bracketlive.ts';
import type { Fixture } from '../src/domain/bracketlive.ts';
import type { Field } from '../src/domain/advance.ts';
import type { ClubState } from '../src/domain/live.ts';

const FIELD: Field = {
  LAC: { conference: 'AFC', seed: 7 },
  NE: { conference: 'AFC', seed: 2 },
  SEA: { conference: 'NFC', seed: 1 },
  LV: { conference: 'AFC', seed: 0 },
  MIA: { conference: 'AFC', seed: 0 },
};

const at = (hour: number) => new Date(Date.UTC(2026, 8, 20, hour));

const fixture = (
  against: string,
  points: number,
  state: ClubState,
  hour: number,
  clock = '',
): Fixture => ({ points, state, kickoff: at(hour), against, home: true, clock });

const tie = { home: 'NE', away: 'LAC', winner: null };
const noYards = () => 0;

describe('a bracket tie while the games are still going', () => {
  it('reads two separate fixtures under one pairing', () => {
    // The rehearsal's whole shape: LAC and NE are bracket opponents playing different opponents.
    const games = new Map([
      ['LAC', fixture('LV', 24, 'final', 17)],
      ['NE', fixture('MIA', 17, 'final', 17)],
    ]);
    const live = liveTie(tie, games, FIELD, noYards);
    assert.equal(live.headToHead, false, 'they are not playing each other');
    assert.deepEqual(live.sides.map((side) => side.against), ['LV', 'MIA']);
    assert.equal(live.leading, 'LAC');
    assert.equal(live.state, 'LAC through');
    assert.equal(live.settled, true);
  });

  it('collapses to one scoreline when the two clubs actually meet', () => {
    // January. Nothing is configured for this; the schedule says they are each other's fixture.
    const games = new Map([
      ['LAC', fixture('NE', 20, 'playing', 17, 'Q3 4:12')],
      ['NE', fixture('LAC', 27, 'playing', 17, 'Q3 4:12')],
    ]);
    const live = liveTie(tie, games, FIELD, noYards);
    assert.equal(live.headToHead, true);
    assert.equal(live.leading, 'NE');
    assert.equal(live.state, 'NE ahead');
  });

  it('refuses to call a lead while one of them has not kicked off', () => {
    // The Chargers at ten in the morning look inevitable until New England plays at half past one.
    const games = new Map([
      ['LAC', fixture('LV', 24, 'final', 17)],
      ['NE', fixture('MIA', 0, 'upcoming', 20)],
    ]);
    const live = liveTie(tie, games, FIELD, noYards);
    assert.equal(live.leading, null, 'nobody is ahead of a team that has not played');
    assert.match(live.state, /LAC 24 final/);
    assert.match(live.state, /NE kicks off/);
    assert.equal(live.settled, false);
  });

  it('says when the first of them starts, before anybody has played', () => {
    const games = new Map([
      ['LAC', fixture('LV', 0, 'upcoming', 17)],
      ['NE', fixture('MIA', 0, 'upcoming', 20)],
    ]);
    const live = liveTie(tie, games, FIELD, noYards);
    assert.equal(live.leading, null);
    assert.match(live.state, /^Kicks off/);
  });

  it('is provisional while both are still playing', () => {
    const games = new Map([
      ['LAC', fixture('LV', 14, 'playing', 17, 'Q2 8:01')],
      ['NE', fixture('MIA', 10, 'playing', 17, 'Q2 1:55')],
    ]);
    const live = liveTie(tie, games, FIELD, noYards);
    assert.equal(live.state, 'LAC ahead', 'ahead, not through');
    assert.equal(live.settled, false);
  });

  it('breaks a dead heat the same way Monday night will', () => {
    const games = new Map([
      ['LAC', fixture('LV', 21, 'final', 17)],
      ['NE', fixture('MIA', 21, 'final', 17)],
    ]);
    const passing = (club: string) => (club === 'NE' ? 290 : 240);
    const live = liveTie(tie, games, FIELD, passing);
    assert.equal(live.leading, 'NE', 'level on points, more passing yards');
    assert.match(whyLeading(live, FIELD, passing) ?? '', /passing yards/);
  });

  it('falls to the better seed when even the yards are level', () => {
    const games = new Map([
      ['LAC', fixture('LV', 21, 'final', 17)],
      ['NE', fixture('MIA', 21, 'final', 17)],
    ]);
    const live = liveTie(tie, games, FIELD, () => 240);
    assert.equal(live.leading, 'NE', 'seed 2 beats seed 7');
    assert.match(whyLeading(live, FIELD, () => 240) ?? '', /better seed/);
  });

  it('says nothing about why when the points already separated them', () => {
    const games = new Map([
      ['LAC', fixture('LV', 24, 'final', 17)],
      ['NE', fixture('MIA', 17, 'final', 17)],
    ]);
    assert.equal(whyLeading(liveTie(tie, games, FIELD, noYards), FIELD, noYards), null);
  });

  it('copes with a club the feed has no fixture for', () => {
    const live = liveTie(tie, new Map([['LAC', fixture('LV', 24, 'final', 17)]]), FIELD, noYards);
    assert.equal(live.sides[1]?.club, 'NE');
    assert.equal(live.leading, null, 'a club with no fixture has not played');
  });
});
