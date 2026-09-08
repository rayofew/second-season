import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { byGame, groupCredited } from '../src/domain/gameday.ts';
import type { Fixture } from '../src/domain/gameday.ts';
import { liveRoster } from '../src/domain/live.ts';
import type { ClubState, LiveInput } from '../src/domain/live.ts';

const kickoff = (hour: number) => new Date(Date.UTC(2026, 8, 13, hour));

const fixture = (
  against: string,
  home: boolean,
  state: ClubState,
  points: number,
  hour: number,
): Fixture => ({ points, state, kickoff: kickoff(hour), against, home, clock: '' });

/** Week 1 of 2026, near enough: Seattle host New England on the Wednesday. */
const GAMES = new Map<string, Fixture>([
  ['SEA', fixture('NE', true, 'playing', 21, 17)],
  ['NE', fixture('SEA', false, 'playing', 17, 17)],
  ['PHI', fixture('DAL', true, 'final', 24, 13)],
  ['DAL', fixture('PHI', false, 'final', 10, 13)],
  ['SF', fixture('LAR', false, 'upcoming', 0, 20)],
  ['LAR', fixture('SF', true, 'upcoming', 0, 20)],
]);

const player = (playerId: string, slot: string, extra: Partial<LiveInput> = {}): LiveInput => ({
  playerId, slot, multiplier: 1, raw: 0, projected: 0, state: 'final', ...extra,
});

const clubs: Record<string, string> = {
  smith: 'SEA', jones: 'SEA', maye: 'NE', hurts: 'PHI', purdy: 'SF', nobody: 'BYE',
};
const clubOf = (playerId: string) => clubs[playerId];

describe('a roster arranged by the games it is spread across', () => {
  it('puts two men on the same club in one game', () => {
    const live = liveRoster([player('smith', 'WR1'), player('jones', 'WR2')]);
    const { games } = byGame(live.players, clubOf, GAMES);
    assert.equal(games.length, 1);
    assert.deepEqual(games[0]!.players.map((entry) => entry.slot), ['WR1', 'WR2']);
  });

  it('puts men on opposite sides in one game too', () => {
    // A quarterback and the defense facing him belong in the same box, watching each other.
    const live = liveRoster([player('smith', 'WR1'), player('maye', 'QB')]);
    const { games } = byGame(live.players, clubOf, GAMES);
    assert.equal(games.length, 1, 'one fixture, not two');
    assert.equal(games[0]!.id, 'NE@SEA');
    assert.equal(games[0]!.players.length, 2);
  });

  it('reads the scoreline the same way round from either side', () => {
    const fromHome = byGame(liveRoster([player('smith', 'WR1')]).players, clubOf, GAMES).games[0]!;
    const fromAway = byGame(liveRoster([player('maye', 'QB')]).players, clubOf, GAMES).games[0]!;
    assert.deepEqual(
      [fromHome.home, fromHome.homePoints, fromHome.away, fromHome.awayPoints],
      ['SEA', 21, 'NE', 17],
    );
    assert.deepEqual([fromAway.home, fromAway.homePoints, fromAway.away, fromAway.awayPoints], ['SEA', 21, 'NE', 17]);
  });

  it('shows what is unresolved before what is banked', () => {
    const live = liveRoster([
      player('hurts', 'QB', { state: 'final' }),
      player('purdy', 'FLEX', { state: 'upcoming' }),
      player('smith', 'WR1', { state: 'playing' }),
    ]);
    const { games } = byGame(live.players, clubOf, GAMES);
    assert.deepEqual(games.map((game) => game.state), ['playing', 'upcoming', 'final']);
  });

  it('sets aside anybody whose club is not playing', () => {
    const live = liveRoster([player('smith', 'WR1'), player('nobody', 'K')]);
    const { games, resting } = byGame(live.players, clubOf, GAMES);
    assert.equal(games.length, 1);
    assert.deepEqual(resting.map((entry) => entry.slot), ['K'], 'a bye is not a game with no score');
  });

  it('adds a game up at the multipliers the men are actually held at', () => {
    // The whole point of the arrangement: the same fixture is worth different amounts to different
    // managers, and to the same manager for different men.
    const live = liveRoster([
      player('smith', 'WR1', { raw: 10, multiplier: 4 }),
      player('jones', 'WR2', { raw: 10, multiplier: 1 }),
    ]);
    const { games } = byGame(live.players, clubOf, GAMES);
    assert.equal(groupCredited(games[0]!), 50, 'forty from one and ten from the other');
  });

  it('carries a man who has not kicked off at his projection', () => {
    const live = liveRoster([player('purdy', 'QB', { projected: 18, raw: 0, state: 'upcoming' })]);
    const { games } = byGame(live.players, clubOf, GAMES);
    assert.equal(groupCredited(games[0]!), 18);
  });
});
