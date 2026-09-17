import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clubPoints, noPoints } from '../src/domain/clubpoints.ts';
import type { Named } from '../src/domain/clubpoints.ts';
import type { StatLine } from '../src/domain/scoring.ts';
import type { ClubState } from '../src/domain/live.ts';

const pool: Named[] = [
  { id: 'qb1', name: 'A Quarterback', position: 'QB', team: 'SEA' },
  { id: 'wr1', name: 'A Receiver', position: 'WR', team: 'SEA' },
  { id: 'def-sea', name: 'Seahawks', position: 'DEF', team: 'SEA' },
  { id: 'rb1', name: 'A Runner', position: 'RB', team: 'NE' },
  { id: 'nobody', name: 'No Club', position: 'WR', team: '' },
];

const playing = () => 'playing' as ClubState;
const upcoming = () => 'upcoming' as ClubState;

describe('what a club is producing', () => {
  it('adds a club up out of the men in the pool', () => {
    const actual: Record<string, StatLine> = {
      qb1: { pass_yd: 250, pass_td: 2 },
      wr1: { rec: 5, rec_yd: 60 },
      'def-sea': { sack: 2, pts_allow: 10 },
    };
    const clubs = clubPoints(pool, actual, {}, playing);
    const sea = clubs.get('SEA')!;
    // 10 + 12 for the quarterback, 5 + 6 for the receiver, 4 for the defense.
    assert.equal(sea.points, 22 + 11 + 4);
    assert.equal(sea.players.length, 3, 'the defense is one of them, not eleven');
  });

  it('counts a defense as a single player', () => {
    const clubs = clubPoints(pool, { 'def-sea': { sack: 3, pts_allow: 0 } }, {}, playing);
    const defense = clubs.get('SEA')!.players.find((player) => player.position === 'DEF');
    assert.equal(defense?.name, 'Seahawks');
    assert.equal(defense?.points, 6 + 10, 'three sacks and a shutout');
  });

  it('orders a club by who is doing most', () => {
    const actual: Record<string, StatLine> = {
      qb1: { pass_yd: 100 },
      wr1: { rec: 8, rec_yd: 140, rec_td: 2 },
    };
    const clubs = clubPoints(pool, actual, {}, playing);
    assert.equal(clubs.get('SEA')!.players[0]?.id, 'wr1', 'the receiver is having the day');
  });

  it('orders a club that has not kicked off by what is expected of it', () => {
    // Sorting an unplayed club by zero would order it by accident and say nothing.
    const expected: Record<string, StatLine> = {
      qb1: { pass_yd: 280, pass_td: 2 },
      wr1: { rec: 3, rec_yd: 30 },
    };
    const clubs = clubPoints(pool, {}, expected, upcoming);
    assert.deepEqual(clubs.get('SEA')!.players.map((player) => player.id), ['qb1', 'wr1', 'def-sea']);
    assert.equal(clubs.get('SEA')!.points, 0, 'nothing has actually happened');
    assert.ok(clubs.get('SEA')!.projected > 0, 'but something is expected');
  });

  it('counts the projection before kickoff and the real figure after', () => {
    const one = clubPoints(pool, { qb1: { pass_yd: 100 } }, { qb1: { pass_yd: 300 } }, upcoming);
    assert.equal(one.get('SEA')!.players.find((p) => p.id === 'qb1')?.counting, 12, 'the projection');
    const two = clubPoints(pool, { qb1: { pass_yd: 100 } }, { qb1: { pass_yd: 300 } }, playing);
    assert.equal(two.get('SEA')!.players.find((p) => p.id === 'qb1')?.counting, 4, 'what he has done');
  });

  it('leaves out anybody with no club at all', () => {
    const clubs = clubPoints(pool, {}, {}, playing);
    assert.equal([...clubs.values()].flatMap((club) => club.players).some((p) => p.id === 'nobody'), false);
  });

  it('gives an empty club for a fixture nobody in the pool plays in', () => {
    const empty = noPoints('LV', 'upcoming');
    assert.deepEqual([empty.points, empty.projected, empty.players.length], [0, 0, 0]);
  });
});
