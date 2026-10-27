import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { carriedTeam, scoreRound } from '../src/domain/scoreround.ts';
import { rawPoints } from '../src/domain/scoring.ts';
import { EASTSIDE } from '../src/domain/rules.ts';

/**
 * The one scoring both the script and the score-and-advance function on Firebase use, so a round
 * scored either way gives the same figures.
 */
const pool = [
  { id: 'qb', name: 'A Quarterback', position: 'QB' as const, team: 'LAR' },
  { id: 'wr', name: 'A Receiver', position: 'WR' as const, team: 'JAX' },
  { id: 'out', name: 'Gone Already', position: 'RB' as const, team: 'SF' },
  { id: 'bye', name: 'Resting', position: 'TE' as const, team: 'DEN' },
];
const stats = {
  qb: { pass_yd: 317, pass_td: 0, pass_int: 2 },
  wr: { rec: 6, rec_yd: 87, rec_td: 1 },
  out: { rush_yd: 100 },
  bye: { rec: 3, rec_yd: 40 },
};

describe('scoring a round', () => {
  const alive = new Set(['LAR', 'JAX', 'DEN']);
  const resting = new Set(['DEN']);
  const round = scoreRound(pool, stats, alive, resting, EASTSIDE);

  it('scores the players still in, exactly as rawPoints does', () => {
    assert.equal(round.players.qb!.raw, rawPoints('QB', stats.qb, EASTSIDE));
    assert.equal(round.players.wr!.raw, rawPoints('WR', stats.wr, EASTSIDE));
  });

  it('gives a knocked-out or resting player no line at all, not a nought', () => {
    assert.ok(!('out' in round.players));
    assert.ok(!('bye' in round.players));
    assert.equal(round.suppressed, 2);
    assert.equal(round.played, 2);
  });

  it('keeps the fields behind a score so it can be checked on screen', () => {
    assert.deepEqual(round.players.wr!.stats, { rec: 6, rec_yd: 87, rec_td: 1 });
  });
});

describe('carrying a team over for somebody who did not press submit', () => {
  const club: Record<string, string> = { qb: 'LAR', wr: 'JAX', out: 'SF', bye: 'DEN' };
  const last = [
    { playerId: 'qb', slot: 'QB' }, { playerId: 'out', slot: 'RB1' }, { playerId: 'bye', slot: 'TE' },
  ];

  it('keeps the survivors in their slots and leaves the knocked-out ones empty', () => {
    const team = carriedTeam(last, (id) => club[id], new Set(['LAR', 'JAX', 'DEN']), new Set(['DEN']));
    assert.deepEqual(team.map((held) => held.slot), ['QB', 'TE']);
    assert.equal(team.find((held) => held.slot === 'TE')!.onBye, true);
  });

  it('carries nothing for somebody who has never submitted', () => {
    assert.deepEqual(carriedTeam([], (id) => club[id], new Set(['LAR']), new Set()), []);
  });
});
