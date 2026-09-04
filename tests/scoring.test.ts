import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { display, rawPoints } from '../src/domain/scoring.ts';
import type { StatLine } from '../src/domain/scoring.ts';

/**
 * Floating point makes 282/25 + 6 - 2 + 4.2 land a hair off 19.48, so points are compared for
 * closeness rather than equality. The stored figure keeps its precision; only the eye needs rounding.
 */
function close(actual: number, expected: number, what: string) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: expected ${expected}, got ${actual}`);
}

/**
 * Every line in this block is a real stat line from Wild Card weekend of the 2024 postseason,
 * pulled from Sleeper and checked by hand. Invented numbers would only ever prove the engine agrees
 * with itself.
 */
describe('raw points, against real Wild Card weekend stat lines', () => {
  it('scores a quarterback, interception and all', () => {
    // C.J. Stroud: 282 pass yds, 1 TD, 1 INT, 42 rush yds.
    const line: StatLine = { pass_yd: 282, pass_td: 1, pass_int: 1, rush_yd: 42 };
    close(rawPoints('QB', line), 282 / 25 + 6 - 2 + 4.2, 'Stroud');
    assert.equal(display(rawPoints('QB', line)), 19.48);
  });

  it('scores a running back', () => {
    // Derrick Henry: 186 rush yds, 2 TD.
    close(rawPoints('RB', { rush_yd: 186, rush_td: 2 }), 30.6, 'Henry');
  });

  it('scores a receiver at full PPR', () => {
    // Ladd McConkey: 9 rec, 197 rec yds, 1 TD.
    close(rawPoints('WR', { rec: 9, rec_yd: 197, rec_td: 1 }), 9 + 19.7 + 6, 'McConkey');
  });

  it('scores a kicker by field goal distance', () => {
    // Ka'imi Fairbairn: two from the thirties, one from the forties, three extra points.
    const line: StatLine = { fgm: 3, fgm_30_39: 2, fgm_40_49: 1, xpm: 3 };
    close(rawPoints('K', line), 2 * 3 + 4 + 3, 'Fairbairn');
  });

  it('scores a defence', () => {
    // Rams: 9 sacks, 1 INT, 1 fumble recovery, 1 defensive TD, 9 points allowed, 8 punt return yds.
    const line: StatLine = { sack: 9, int: 1, fum_rec: 1, def_td: 1, pts_allow: 9, def_pr_yd: 8 };
    close(rawPoints('DEF', line), 18 + 2 + 2 + 6 + 8 / 25, 'Rams');
  });
});

describe('the rules that decide games', () => {
  it('gives nothing to a player whose team did not play', () => {
    // One implementation covers both elimination and a first-round bye: no game, no stat line.
    assert.equal(rawPoints('RB', undefined), 0);
    assert.equal(rawPoints('DEF', undefined), 0);
  });

  it('pays the five field goal bonus once, however many follow', () => {
    const five = rawPoints('K', { fgm: 5, fgm_30_39: 5 });
    const six = rawPoints('K', { fgm: 6, fgm_30_39: 6 });
    assert.equal(five, 5 * 3 + 5);
    assert.equal(six, 6 * 3 + 5, 'a sixth field goal earns its own points but no second bonus');
    assert.equal(rawPoints('K', { fgm: 4, fgm_30_39: 4 }), 4 * 3, 'four is not five');
  });

  it('separates a 60 yard field goal from the 50s', () => {
    // Sleeper reports everything past fifty in fgm_50p and only sometimes breaks out fgm_60p.
    const derived = rawPoints('K', { fgm: 2, fgm_50_59: 1, fgm_50p: 2 });
    assert.equal(derived, 5 + 10, 'the one beyond the 50s bucket is a 60 yarder');
    const explicit = rawPoints('K', { fgm: 2, fgm_50_59: 1, fgm_50p: 2, fgm_60p: 1 });
    assert.equal(explicit, 5 + 10, 'and the explicit figure agrees');
  });

  it('pays a shutout but never mistakes a missing figure for one', () => {
    assert.equal(rawPoints('DEF', { sack: 0, pts_allow: 0 }), 10);
    assert.equal(rawPoints('DEF', { sack: 1, pts_allow: 3 }), 2 + 5, 'one to three is worth five');
    assert.equal(rawPoints('DEF', { sack: 1, pts_allow: 4 }), 2, 'four is worth nothing');
    assert.equal(rawPoints('DEF', { sack: 1 }), 2, 'no points-allowed figure is not a shutout');
  });

  it('reads an interception as the position means it', () => {
    // The same field name is a quarterback's mistake and a defence's takeaway.
    assert.equal(rawPoints('QB', { pass_int: 1 }), -2);
    assert.equal(rawPoints('DEF', { int: 1 }), 2);
  });

  it('counts a two point conversion however it was scored', () => {
    assert.equal(rawPoints('QB', { pass_2pt: 1 }), 2);
    assert.equal(rawPoints('RB', { rush_2pt: 1 }), 2);
    assert.equal(rawPoints('WR', { rec_2pt: 1 }), 2);
  });

  it('charges for a lost fumble', () => {
    close(rawPoints('RB', { rush_yd: 50, fum_lost: 1 }), 5 - 2, 'fumble');
  });

  it('keeps precision in the stored figure and rounds only for the eye', () => {
    const points = rawPoints('QB', { pass_yd: 267 });
    assert.equal(points, 267 / 25, 'stored to full precision');
    assert.equal(display(points), 10.68);
  });
});
