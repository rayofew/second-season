import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { statLine } from '../src/domain/statline.ts';

/**
 * The lines below are the real week 18 box score the league was scored from, so the phrasing can be
 * checked against what these managers have actually been reading rather than against my idea of it.
 */
describe('a stat line in the words a box score uses', () => {
  it('reads a quarterback the way the league does', () => {
    // J. Dart: 230 passing yards, two touchdowns.
    assert.equal(statLine('QB', { pass_yd: 230, pass_td: 2 }), '230 Yd 2 TD');
  });

  it('labels a quarterback’s rushing, because his other yards are already on the row', () => {
    assert.equal(statLine('QB', { pass_yd: 230, pass_td: 2, rush_yd: 31 }), '230 Yd 2 TD 31 Rush Yd');
  });

  it('leaves a running back’s rushing bare and names his catches', () => {
    // B. Robinson: 33 rushing, three catches from three targets for ten.
    assert.equal(statLine('RB', { rush_yd: 33, rec: 3, rec_tgt: 3, rec_yd: 10 }), '33 Yd 3/3 Rec 10 Yd');
  });

  it('reads a receiver catches first', () => {
    // D. London: four from eight, 78 yards, a touchdown — the line that settled the yardage rule.
    assert.equal(statLine('WR', { rec: 4, rec_tgt: 8, rec_yd: 78, rec_td: 1 }), '4/8 Rec 78 Yd 1 TD');
  });

  it('reads a tight end the same way as a receiver', () => {
    assert.equal(statLine('TE', { rec: 2, rec_tgt: 3, rec_yd: 14 }), '2/3 Rec 14 Yd');
  });

  it('reads a kicker as makes over attempts', () => {
    // J. Myers: two field goals from four, one extra point from one.
    assert.equal(statLine('K', { fgm: 2, fga: 4, xpm: 1, xpa: 1 }), '2/4 FG 1/1 XP');
  });

  it('reads a defense, and keeps points allowed even at zero', () => {
    assert.equal(
      statLine('DEF', { sack: 2, int: 1, pts_allow: 3 }),
      '2 Sack 1 INT 3 PA',
    );
    assert.equal(statLine('DEF', { sack: 1, pts_allow: 0 }), '1 Sack 0 PA', 'a shutout is the whole story');
  });

  it('leaves out everything a man did not do', () => {
    // A receiver who never carried the ball is not told he ran for none.
    assert.equal(statLine('WR', { rec: 1, rec_tgt: 1, rec_yd: 9 }), '1/1 Rec 9 Yd');
  });

  it('says nothing at all for a man with no line yet', () => {
    assert.equal(statLine('QB', undefined), '');
    assert.equal(statLine('WR', {}), '');
  });

  it('mentions a lost fumble, which is the one bad thing worth naming', () => {
    assert.equal(statLine('RB', { rush_yd: 40, fum_lost: 1 }), '40 Yd 1 FUM');
  });

  it('drops a category that rounds away to nothing', () => {
    // Found against the real feed: a projected 0.4 rushing touchdowns is a truthy number that
    // rounds to zero, and testing it before rounding put "0 TD" on the end of every row.
    assert.equal(statLine('WR', { rec: 4.2, rec_tgt: 6.8, rec_yd: 54.3, rec_td: 0.4 }), '4/7 Rec 54 Yd');
    assert.equal(statLine('RB', { rush_yd: 71.4, rush_td: 0.3, fum_lost: 0.2 }), '71 Yd');
  });

  it('rounds a projection into the shape of a box score', () => {
    // Projections arrive fractional. "212.4 Yd 1.57 TD" is not a line anybody has ever read.
    assert.equal(statLine('QB', { pass_yd: 212.4, pass_td: 1.57 }), '212 Yd 2 TD');
  });
});
