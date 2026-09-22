import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { silence } from '../src/domain/resting.ts';
import { rawPoints } from '../src/domain/scoring.ts';
import { EASTSIDE } from '../src/domain/rules.ts';

const CLUBS: Record<string, string> = { purdy: 'SF', nacua: 'LAR', bo: 'DEN', jsn: 'SEA' };
const clubOf = (id: string) => CLUBS[id];

const LINES = {
  purdy: { pass_yd: 300, pass_td: 3 },
  bo: { pass_yd: 280, pass_td: 2 },
  jsn: { rec: 8, rec_yd: 110, rec_td: 1 },
};

describe('a club that is resting', () => {
  it('has no statistics that week, so its players score nothing', () => {
    // The rehearsal's byes are invented over a real NFL week, so the feed hands back real
    // touchdowns for men who by our rules were never on the field.
    const kept = silence(LINES, clubOf, new Set(['DEN', 'SEA']));
    assert.deepEqual(Object.keys(kept), ['purdy']);
    assert.equal(rawPoints('QB', kept.bo, EASTSIDE), 0, 'and a missing line is nought');
    assert.ok(rawPoints('QB', LINES.bo, EASTSIDE) > 0, 'which it would not have been');
  });

  it('leaves everybody else exactly as they were', () => {
    const kept = silence(LINES, clubOf, new Set(['DEN']));
    assert.equal(kept.purdy, LINES.purdy, 'the same object, not a rebuilt one');
    assert.equal(rawPoints('WR', kept.jsn, EASTSIDE), rawPoints('WR', LINES.jsn, EASTSIDE));
  });

  it('keeps a player whose club nobody can identify', () => {
    // Guessing somebody out of the contest is a worse failure than letting one through.
    const kept = silence({ ...LINES, mystery: { rec: 4 } }, clubOf, new Set(['DEN']));
    assert.ok('mystery' in kept);
  });

  it('changes nothing at all in a round where nobody rests', () => {
    assert.deepEqual(silence(LINES, clubOf, new Set()), LINES);
  });
});
