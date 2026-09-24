import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gravity, injuries, injuryOf } from '../src/domain/injury.ts';
import type { RawInjuries } from '../src/domain/injury.ts';

const player = (name: string, club: string, status: string, abbreviation: string, id?: string) => ({
  status,
  type: { abbreviation, description: status.toLowerCase() },
  details: { type: 'Hamstring' },
  athlete: {
    displayName: name,
    team: { abbreviation: club },
    links: id ? [{ href: `https://www.espn.com/nfl/player/_/id/${id}/whoever` }] : [],
  },
});

const RAW: RawInjuries = {
  injuries: [{
    injuries: [
      player('Puka Nacua', 'LAR', 'Questionable', 'Q', '4426515'),
      player('Nico Collins', 'HOU', 'Out', 'O', '4258173'),
      player('Somebody Else', 'BUF', 'Active', 'A', '111'),
      player('J.K. Dobbins Jr.', 'DEN', 'Injured Reserve', 'IR'),
    ],
  }],
};

describe('who is hurt', () => {
  it('takes the id out of the link, which is the only place the feed puts it', () => {
    const found = injuries(RAW);
    assert.equal(found.byEspnId.get('4426515')?.mark, 'Q');
    assert.equal(found.byEspnId.get('4258173')?.status, 'Out');
  });

  it('ignores a man the feed files as active, which is not an injury', () => {
    assert.equal(injuries(RAW).byEspnId.get('111'), undefined);
  });

  it('falls back to the name and the club when there is no id', () => {
    // Two clubs can hold men of the same name; one club almost never does.
    const found = injuries(RAW);
    assert.equal(injuryOf(found, { name: 'J.K. Dobbins', team: 'DEN' })?.mark, 'IR');
    assert.equal(injuryOf(found, { name: 'J.K. Dobbins', team: 'BUF' }), undefined);
  });

  it('prefers the id, because two men can share a name', () => {
    const found = injuries(RAW);
    assert.equal(injuryOf(found, { espnId: '4258173', name: 'Wrong Name', team: 'XXX' })?.mark, 'O');
  });

  it('keeps what he has done to himself, when the feed says', () => {
    assert.equal(injuries(RAW).byEspnId.get('4426515')?.detail, 'Hamstring');
  });

  it('separates a fact from a coin toss', () => {
    // Out and reserve are decided. Questionable is a Sunday morning problem.
    assert.equal(gravity('O'), 'gone');
    assert.equal(gravity('IR'), 'gone');
    assert.equal(gravity('D'), 'doubt');
    assert.equal(gravity('Q'), 'maybe');
  });

  it('gives nothing rather than nonsense for an empty feed', () => {
    const found = injuries({});
    assert.equal(found.byEspnId.size, 0);
    assert.equal(injuryOf(found, { name: 'Anybody', team: 'SF' }), undefined);
    assert.equal(injuryOf(null, { name: 'Anybody', team: 'SF' }), undefined);
  });
});
