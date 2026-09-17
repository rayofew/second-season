import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { breakdown, breakdownTotal } from '../src/domain/breakdown.ts';
import { rawPoints } from '../src/domain/scoring.ts';
import type { StatLine } from '../src/domain/scoring.ts';
import type { Position } from '../src/domain/rules.ts';
import { EASTSIDE } from '../src/domain/rules.ts';

/**
 * Real lines from Wild Card weekend 2024 and week 18 of 2025, the same ones the scoring suite uses.
 * If the breakdown and the scorer ever disagree, one of them is lying about what the league pays —
 * and the one on screen is the one people will believe.
 */
const REAL: [Position, string, StatLine][] = [
  ['QB', 'C.J. Stroud', { pass_yd: 282, pass_td: 1, pass_int: 1, rush_yd: 42 }],
  ['RB', 'Derrick Henry', { rush_yd: 186, rush_td: 2 }],
  ['WR', 'Ladd McConkey', { rec: 9, rec_yd: 197, rec_td: 1 }],
  ['WR', 'Drake London', { rec: 4, rec_yd: 78, rec_td: 1 }],
  ['TE', 'AJ Barner', { rec: 2, rec_yd: 14 }],
  ['K', 'Jason Myers', { fgm: 2, fga: 4, fgm_30_39: 1, fgm_40_49: 1, xpm: 1, xpa: 1 }],
  ['K', 'five field goals', { fgm: 5, fgm_30_39: 3, fgm_40_49: 1, fgm_50p: 1, xpm: 2 }],
  ['DEF', 'Seahawks wk18', { sack: 3, int: 1, pts_allow: 3, def_kr_yd: 34, def_pr_yd: 30 }],
  ['DEF', '49ers wk18', { sack: 2, pts_allow: 13, def_kr_yd: 36 }],
  ['DEF', 'a shutout', { sack: 4, int: 2, fum_rec: 1, def_td: 1, pts_allow: 0 }],
  ['RB', 'a fumbler', { rush_yd: 40, fum_lost: 1 }],
  ['WR', 'a returner', { rec: 2, rec_yd: 20, st_td: 1 }],
];

describe('the breakdown behind a score', () => {
  for (const [position, who, line] of REAL) {
    it(`adds up to what ${who} is actually paid`, () => {
      const lines = breakdown(position, line);
      const scored = rawPoints(position, line, EASTSIDE);
      assert.ok(
        Math.abs(breakdownTotal(lines) - scored) < 1e-9,
        `${who}: breakdown says ${breakdownTotal(lines)}, the scorer says ${scored}\n`
          + lines.map((entry) => `  ${entry.label}: ${entry.detail} = ${entry.points}`).join('\n'),
      );
    });
  }

  it('agrees under a whole-point league too, where yardage floors', () => {
    const whole = { ...EASTSIDE, scoring: { ...EASTSIDE.scoring, wholePoints: true } };
    for (const [position, who, line] of REAL) {
      const lines = breakdown(position, line, whole);
      assert.equal(breakdownTotal(lines), rawPoints(position, line, whole), who);
    }
  });

  it('names the biggest contribution first, which is what anybody is looking for', () => {
    // 186 yards is 18.6 and two scores are 12, so the yardage leads.
    const lines = breakdown('RB', { rush_yd: 186, rush_td: 2 });
    assert.deepEqual(lines.map((entry) => entry.label), ['Rushing yards', 'Rushing touchdowns']);
  });

  it('shows how a defense earned its points-allowed tier', () => {
    const lines = breakdown('DEF', { sack: 1, pts_allow: 0 });
    const allowed = lines.find((entry) => entry.label === 'Points allowed');
    assert.equal(allowed?.points, 10);
    assert.match(allowed?.detail ?? '', /shutout/);
  });

  it('says nothing at all for a man with no line', () => {
    assert.deepEqual(breakdown('QB', undefined), []);
    assert.deepEqual(breakdown('WR', {}), []);
  });
});
