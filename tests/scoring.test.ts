import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { display, projectedPoints, rawPoints } from '../src/domain/scoring.ts';
import type { StatLine } from '../src/domain/scoring.ts';
import { EASTSIDE } from '../src/domain/rules.ts';
import type { ContestSettings, Scoring } from '../src/domain/rules.ts';

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
    close(rawPoints('QB', line), 11 + 6 - 2 + 4, 'Stroud');
    assert.equal(rawPoints('QB', line), 19, '282 passing yards is 11 points, not 11.28');
  });

  it('scores a running back', () => {
    // Derrick Henry: 186 rush yds, 2 TD.
    close(rawPoints('RB', { rush_yd: 186, rush_td: 2 }), 18 + 12, 'Henry');
  });

  it('scores a receiver at full PPR', () => {
    // Ladd McConkey: 9 rec, 197 rec yds, 1 TD.
    close(rawPoints('WR', { rec: 9, rec_yd: 197, rec_td: 1 }), 9 + 19 + 6, 'McConkey');
  });

  it('scores a kicker by field goal distance', () => {
    // Ka'imi Fairbairn: two from the thirties, one from the forties, three extra points.
    const line: StatLine = { fgm: 3, fgm_30_39: 2, fgm_40_49: 1, xpm: 3 };
    close(rawPoints('K', line), 2 * 3 + 4 + 3, 'Fairbairn');
  });

  it('scores a defense', () => {
    // Rams: 9 sacks, 1 INT, 1 fumble recovery, 1 defensive TD, 9 points allowed, 8 punt return yds.
    const line: StatLine = { sack: 9, int: 1, fum_rec: 1, def_td: 1, pts_allow: 9, def_pr_yd: 8 };
    close(rawPoints('DEF', line), 18 + 2 + 2 + 6 + 0, 'Rams');
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
    // The same field name is a quarterback's mistake and a defense's takeaway.
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
    // 267 passing yards is ten points and the 17 left over earn nothing: the fraction never exists.
    assert.equal(rawPoints('QB', { pass_yd: 267 }), 10);
    assert.equal(rawPoints('QB', { pass_yd: 274 }), 10, 'and still ten at 274');
    assert.equal(rawPoints('QB', { pass_yd: 275 }), 11, 'the eleventh arrives at 275');
  });
});

/**
 * The commissioner's screen is only as good as this block.
 *
 * A rule that looks configurable but is really a literal somewhere in the engine would pass every
 * test above, because every test above uses Eastside's numbers. These use somebody else's.
 */
describe('rules the commissioner can change', () => {
  const under = (changes: Partial<Scoring>, rest: Partial<ContestSettings> = {}): ContestSettings => ({
    ...EASTSIDE,
    ...rest,
    scoring: { ...EASTSIDE.scoring, ...changes },
  });

  it('pays touchdowns at whatever the league says', () => {
    const line = { pass_td: 2 };
    assert.equal(rawPoints('QB', line), 12, 'Eastside pays six');
    assert.equal(rawPoints('QB', line, under({ passingTouchdown: 4 })), 8, 'a four point league pays four');
  });

  it('handles half PPR and no PPR', () => {
    const line = { rec: 6, rec_yd: 60 };
    assert.equal(rawPoints('WR', line), 12, 'full PPR');
    assert.equal(rawPoints('WR', line, under({ reception: 0.5 })), 9, 'half');
    assert.equal(rawPoints('WR', line, under({ reception: 0 })), 6, 'none');
  });

  it('takes any number of points allowed tiers, not just Eastside two', () => {
    // The six band ladder most leagues use, which Eastside does not have.
    const ladder = under({
      pointsAllowed: [
        { upTo: 0, points: 10 },
        { upTo: 6, points: 7 },
        { upTo: 13, points: 4 },
        { upTo: 20, points: 1 },
        { upTo: 27, points: 0 },
        { upTo: 34, points: -1 },
        { upTo: Infinity, points: -4 },
      ],
    });
    assert.equal(rawPoints('DEF', { pts_allow: 0 }, ladder), 10);
    assert.equal(rawPoints('DEF', { pts_allow: 6 }, ladder), 7, 'a band Eastside does not have');
    assert.equal(rawPoints('DEF', { pts_allow: 21 }, ladder), 0);
    assert.equal(rawPoints('DEF', { pts_allow: 41 }, ladder), -4, 'and a losing one');
    assert.equal(rawPoints('DEF', { pts_allow: 6 }), 0, 'while Eastside still pays nothing for six');
  });

  it('lets the kicker bonus move', () => {
    const four = under({ fieldGoalBonus: { atLeast: 4, points: 3 } });
    assert.equal(rawPoints('K', { fgm: 4, fgm_30_39: 4 }, four), 12 + 3);
    assert.equal(rawPoints('K', { fgm: 4, fgm_30_39: 4 }), 12, 'Eastside wants five before it pays');
  });

  it('shows as many decimals as the league asked for', () => {
    // Yardage is whole, so a fraction has to come from somewhere else — half a point a catch.
    const half = under({ reception: 0.5 });
    const points = rawPoints('WR', { rec: 5, rec_yd: 44 }, half);
    assert.equal(points, 6.5, 'two and a half for the catches, four for the yards');
    assert.equal(display(points, { ...half, displayDecimals: 0 }), 7);
  });

  it('describes slots as data, so Superflex is a setting and not a rewrite', () => {
    const flex = EASTSIDE.slots.find((slot) => slot.id === 'FLEX');
    assert.deepEqual(flex?.eligible, ['RB', 'WR', 'TE']);
    const superflex: ContestSettings = {
      ...EASTSIDE,
      slots: EASTSIDE.slots.map((slot) => (slot.id === 'FLEX' ? { ...slot, eligible: ['QB', 'RB', 'WR', 'TE'] } : slot)),
    };
    assert.ok(superflex.slots.find((slot) => slot.id === 'FLEX')?.eligible.includes('QB'));
    assert.equal(superflex.slots.length, 9, 'and it is still nine slots');
  });
});

describe('return touchdowns', () => {
  it('pays the man who ran it back', () => {
    // Found by checking our totals against Sleeper's own: two players were six points light,
    // both of whom had returned a kick. Sleeper credits the returner and so does every platform.
    assert.equal(rawPoints('WR', { st_td: 1 }), 6);
    assert.equal(rawPoints('RB', { rush_yd: 40, st_td: 1 }), 4 + 6);
  });

  it('does not pay a defense twice for the same score', () => {
    // A defense's return touchdowns are counted with the rest of its work, never through the
    // outfield path, so the two can't both land on one stat line.
    assert.equal(rawPoints('DEF', { def_st_td: 1, st_td: 1 }), 6);
  });

  it('is a setting like everything else', () => {
    const noReturns = { ...EASTSIDE, scoring: { ...EASTSIDE.scoring, returnTouchdown: 0 } };
    assert.equal(rawPoints('WR', { st_td: 1 }, noReturns), 0);
  });
});

describe('yards pay whole points', () => {
  it('gives nothing for the yards that do not complete a point', () => {
    // 78 receiving yards is seven points. Not 7.8 — the fraction is never created, which is why
    // every score in this league is a whole number without anything being rounded afterwards.
    assert.equal(rawPoints('WR', { rec_yd: 78 }), 7);
    assert.equal(rawPoints('WR', { rec_yd: 79 }), 7, 'and still seven at 79');
    assert.equal(rawPoints('WR', { rec_yd: 80 }), 8, 'the eighth arrives at 80');
  });

  it('counts each kind of yard on its own', () => {
    // 9 rushing and 9 receiving is not 18 yards and a point; it is nothing twice over.
    assert.equal(rawPoints('RB', { rush_yd: 9, rec_yd: 9 }), 0);
    assert.equal(rawPoints('RB', { rush_yd: 19, rec_yd: 19 }), 2, 'one point from each');
  });

  it('applies to passing at its own rate', () => {
    assert.equal(rawPoints('QB', { pass_yd: 274 }), 10);
    assert.equal(rawPoints('QB', { pass_yd: 275 }), 11);
  });

  it('leaves everything that is already whole alone', () => {
    // Catches and scores were never fractional, so nothing about them changes.
    assert.equal(rawPoints('WR', { rec: 9, rec_yd: 197, rec_td: 1 }), 9 + 19 + 6);
  });

  it('matches what the league itself credited', () => {
    // Drake London, 2025 week 18: four catches, 78 yards, a touchdown. Fleaflicker paid 17, and
    // this is the case that proved yards are whole rather than that scores are rounded at the end.
    assert.equal(rawPoints('WR', { rec: 4, rec_yd: 78, rec_td: 1 }), 17);
  });
});

describe('projections', () => {
  it('come back whole, because a real score always is', () => {
    // A projected line holds fractions of things that cannot be fractional: 1.57 passing touchdowns
    // is a sensible expectation and an impossible afternoon.
    const line = { pass_yd: 250, pass_td: 1.57 };
    assert.equal(rawPoints('QB', line), 10 + 9.42, 'the raw figure keeps the fraction');
    assert.equal(projectedPoints('QB', line), 19, 'and the projection does not');
  });

  it('floor the yards before rounding anything else', () => {
    // 78.9 projected yards is still seven points, not eight — the yardage rule comes first.
    assert.equal(projectedPoints('WR', { rec_yd: 78.9 }), 7);
  });

  it('handle a man with no projection at all', () => {
    assert.equal(projectedPoints('WR', undefined), 0);
  });
});
