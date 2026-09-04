import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { creditedPoints, standingsFor } from '../src/domain/multiplier.ts';
import type { HeldPlayer, RosterHistory } from '../src/domain/multiplier.ts';
import { display, rawPoints } from '../src/domain/scoring.ts';
import { EASTSIDE } from '../src/domain/rules.ts';

const held = (playerId: string, extra: Partial<HeldPlayer> = {}): HeldPlayer => ({
  playerId,
  position: 'RB',
  slot: 'RB1',
  ...extra,
});

/** What one player is worth in the last round of a given history. */
function worth(history: RosterHistory, playerId: string, settings = EASTSIDE) {
  const round = history.length - 1;
  const standing = standingsFor(history, round, settings).find((entry) => entry.playerId === playerId);
  assert.ok(standing, `${playerId} is not on the roster in round ${round}`);
  return standing;
}

describe('the multiplier, round by round', () => {
  it('starts a new man at 1x', () => {
    assert.equal(worth([[held('henry')]], 'henry').multiplier, 1);
  });

  it('pays 2x for keeping him through the Divisional round', () => {
    assert.equal(worth([[held('henry')], [held('henry')]], 'henry').multiplier, 2);
  });

  it('reaches 4x for a man held from Wild Card to the Super Bowl', () => {
    const kept: RosterHistory = [[held('henry')], [held('henry')], [held('henry')], [held('henry')]];
    const standing = worth(kept, 'henry');
    assert.equal(standing.multiplier, 4);
    assert.equal(standing.heldSince, 0, 'and the screen can say he has been there since Wild Card');
  });

  it('never goes beyond 4x, however long the run', () => {
    const forever: RosterHistory = Array.from({ length: 6 }, () => [held('henry')]);
    const standing = worth(forever, 'henry');
    assert.equal(standing.streak, 6, 'the run is honestly counted');
    assert.equal(standing.multiplier, 4, 'and honestly capped');
  });

  it('starts a replacement at 1x however far his team has come', () => {
    const swapped: RosterHistory = [[held('henry')], [held('henry')], [held('gibbs')]];
    assert.equal(worth(swapped, 'gibbs').multiplier, 1);
    assert.equal(worth(swapped, 'gibbs').retained, false);
  });

  it('starts a man over when he is dropped and picked up again', () => {
    // The whole point of the rule: a prior run is gone, not banked.
    const rehired: RosterHistory = [[held('henry')], [held('gibbs')], [held('henry')]];
    const standing = worth(rehired, 'henry');
    assert.equal(standing.multiplier, 1);
    assert.equal(standing.streak, 1);
    assert.equal(standing.heldSince, 2, 'the new run began when he came back');
  });

  it('marks a familiar face as retained and a new signing as not', () => {
    const mixed: RosterHistory = [[held('henry')], [held('henry'), held('gibbs', { slot: 'RB2' })]];
    assert.equal(worth(mixed, 'henry').retained, true);
    assert.equal(worth(mixed, 'gibbs').retained, false);
  });
});

describe('what does not break a streak', () => {
  it('moving him between slots', () => {
    // Streaks follow the player, so sliding a man into FLEX costs nothing.
    const shuffled: RosterHistory = [
      [held('henry', { slot: 'RB1' })],
      [held('henry', { slot: 'RB2' })],
      [held('henry', { slot: 'FLEX' })],
    ];
    assert.equal(worth(shuffled, 'henry').multiplier, 3);
  });

  it('a week where he was hurt, inactive, or simply bad', () => {
    // Nothing about scoring reaches this engine, so a nought is indistinguishable from a hundred.
    const quiet: RosterHistory = [[held('henry')], [held('henry')], [held('henry')]];
    assert.equal(worth(quiet, 'henry').multiplier, 3);
  });

  it('his team being knocked out, for as long as the manager keeps him', () => {
    // He will score nothing, but the streak is about holding him, not about him playing.
    const doomed: RosterHistory = [[held('henry')], [held('henry')], [held('henry')]];
    assert.equal(worth(doomed, 'henry').multiplier, 3);
    assert.equal(rawPoints('RB', undefined), 0, 'the zero comes from having no stat line at all');
  });
});

describe('first round byes, which the commissioner may rule either way', () => {
  const rested: RosterHistory = [[held('barkley', { onBye: true })], [held('barkley')]];

  it('counts the bye towards the streak by default, so he returns at 2x', () => {
    assert.equal(worth(rested, 'barkley').multiplier, 2);
  });

  it('and does not, when the league has said start-fresh', () => {
    const fresh = { ...EASTSIDE, byeRule: 'start-fresh' as const };
    assert.equal(worth(rested, 'barkley', fresh).multiplier, 1);
  });

  it('shows him at 1x during the bye itself either way, since he cannot score', () => {
    const fresh = { ...EASTSIDE, byeRule: 'start-fresh' as const };
    const wildcard: RosterHistory = [[held('barkley', { onBye: true })]];
    assert.equal(worth(wildcard, 'barkley').multiplier, 1);
    assert.equal(worth(wildcard, 'barkley', fresh).streak, 0, 'the round genuinely earned him nothing');
    assert.equal(worth(wildcard, 'barkley', fresh).multiplier, 1, 'but 1x is what the screen should say');
  });

  it('keeps a bye man on the same footing as anyone else afterwards', () => {
    const long: RosterHistory = [
      [held('barkley', { onBye: true })],
      [held('barkley')],
      [held('barkley')],
      [held('barkley')],
    ];
    assert.equal(worth(long, 'barkley').multiplier, 4, 'by default the bye round counted');
    const fresh = { ...EASTSIDE, byeRule: 'start-fresh' as const };
    assert.equal(worth(long, 'barkley', fresh).multiplier, 3, 'and under start-fresh it did not');
  });
});

describe('raw points first, multiplier second', () => {
  it('scores the performance without any idea what it will be worth', () => {
    // Derrick Henry's real Wild Card line. The same stats are the same points at every multiplier.
    const line = { rush_yd: 186, rush_td: 2 };
    const raw = rawPoints('RB', line);
    assert.equal(raw, 30.6);

    const atThree: RosterHistory = [[held('henry')], [held('henry')], [held('henry')]];
    const standing = worth(atThree, 'henry');
    assert.equal(standing.multiplier, 3);
    assert.equal(rawPoints('RB', line), raw, 'the streak cannot reach back and change what he scored');
    // 30.6 x 3 lands at 91.80000000000001, so the stored figure keeps its precision and the eye gets a rounded one.
    assert.equal(display(creditedPoints(raw, standing.multiplier)), 91.8);
  });

  it('lets a long held journeyman beat a fresh star', () => {
    // The decision the endgame turns on, in one assertion.
    const veteran = creditedPoints(rawPoints('RB', { rush_yd: 60, rush_td: 0 }), 4);
    const newcomer = creditedPoints(rawPoints('RB', { rush_yd: 120, rush_td: 1 }), 1);
    assert.equal(veteran, 24);
    assert.equal(newcomer, 18);
    assert.ok(veteran > newcomer, 'which is the entire point of the game');
  });
});
