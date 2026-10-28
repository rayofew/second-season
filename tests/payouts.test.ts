import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_PLAN, breakdown, fitToCap, parseShares, problems, sampleSizes, split, tierFor } from '../src/domain/payouts.ts';
import { weeklyPaid } from '../src/domain/weekly.ts';
import { isUsPhone } from '../src/domain/phone.ts';

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

describe('splitting a sum into whole dollars', () => {
  it('adds back up to exactly what went in', () => {
    for (const amount of [0, 1, 99, 250, 999, 4600]) {
      assert.equal(sum(split(amount, [45, 27, 18, 10])), amount);
    }
  });

  it('gives the rounding to the top of the list', () => {
    assert.deepEqual(split(100, [1, 1, 1]), [34, 33, 33]);
  });

  it('divides in proportion when the shares do not add to 100', () => {
    assert.deepEqual(split(90, [2, 1]), [60, 30]);
  });
});

describe('the default plan, from 5 people to 100', () => {
  it('never pays out more or less than the pot', () => {
    for (let field = 5; field <= 100; field += 1) {
      const paid = breakdown(field, DEFAULT_PLAN, 4);
      assert.equal(paid.weeklyTotal + sum(paid.places), paid.pot, `field of ${field}`);
    }
  });

  it('pays the last place at least his buy-in back', () => {
    for (let field = 5; field <= 100; field += 1) {
      const paid = breakdown(field, DEFAULT_PLAN, 4);
      assert.ok(paid.places.at(-1)! >= DEFAULT_PLAN.buyIn, `field of ${field}: last place ${paid.places.at(-1)}`);
    }
  });

  it('keeps the winner at a quarter of the pot or more', () => {
    for (let field = 5; field <= 100; field += 1) {
      const paid = breakdown(field, DEFAULT_PLAN, 4);
      assert.ok(paid.places[0]! >= paid.pot * 0.24, `field of ${field}: winner ${paid.places[0]} of ${paid.pot}`);
    }
  });

  it('grows the weekly prize with the pot, and pays more spots at a big field', () => {
    assert.equal(breakdown(10, DEFAULT_PLAN, 4).weeklySpots.length, 1);
    assert.equal(breakdown(60, DEFAULT_PLAN, 4).weeklySpots.length, 2);
    assert.equal(breakdown(100, DEFAULT_PLAN, 4).weeklySpots.length, 3);
    assert.ok(sum(breakdown(100, DEFAULT_PLAN, 4).weeklySpots) > sum(breakdown(20, DEFAULT_PLAN, 4).weeklySpots));
  });

  it('has nothing wrong with it', () => {
    assert.deepEqual(problems(DEFAULT_PLAN), []);
  });
});

describe('reading the bands', () => {
  it('uses the last band for a field bigger than the table', () => {
    assert.equal(tierFor(DEFAULT_PLAN.tiers, 5000)?.shares.length, 15);
  });

  it('never pays more places than there are people', () => {
    const tiny = { ...DEFAULT_PLAN, tiers: [{ upTo: 10, shares: [50, 30, 20] }] };
    assert.equal(breakdown(2, tiny, 4).places.length, 2);
  });
});

describe('what the calculator refuses to lock', () => {
  it('a band that does not add up to 100', () => {
    const plan = { ...DEFAULT_PLAN, tiers: [{ upTo: 10, shares: [50, 30] }] };
    assert.ok(problems(plan).some((problem) => problem.includes('80%')));
  });

  it('a lower place paying more than a higher one', () => {
    const plan = { ...DEFAULT_PLAN, tiers: [{ upTo: 10, shares: [30, 70] }] };
    assert.ok(problems(plan).some((problem) => problem.includes('lower place')));
  });

  it('no buy-in', () => {
    assert.ok(problems({ ...DEFAULT_PLAN, buyIn: 0 }).length > 0);
  });

  it('reads "45/27/18/10" the way it is typed', () => {
    assert.deepEqual(parseShares('45/27 18, 10'), [45, 27, 18, 10]);
  });
});

describe('paying more than one spot a week', () => {
  const entry = (entryId: string, raw: number) => ({
    entryId, name: entryId, raw, credited: raw, rounds: [{ round: 0, raw, credited: raw, players: [] }],
  });

  it('pays the best three in order', () => {
    const [week] = weeklyPaid([entry('a', 90), entry('b', 120), entry('c', 100), entry('d', 80)], [50, 30, 20]);
    assert.deepEqual(week!.paid.map((p) => [p.entryId, p.amount]), [['b', 50], ['c', 30], ['a', 20]]);
  });

  it('splits a tie across the spots it covers', () => {
    const [week] = weeklyPaid([entry('a', 120), entry('b', 100), entry('c', 100)], [50, 30, 20]);
    assert.deepEqual(week!.paid.map((p) => [p.entryId, p.amount]), [['a', 50], ['b', 25], ['c', 25]]);
  });
});

describe('the phone number at sign-up', () => {
  it('takes a US number however it is typed', () => {
    for (const ok of ['(425) 471-4580', '425-471-4580', '4254714580', '+1 425 471 4580']) assert.ok(isUsPhone(ok), ok);
  });
  it('refuses something that is not one', () => {
    for (const bad of ['', '471-4580', '123-456-7890', '425 471 458', '012 471 4580']) assert.ok(!isUsPhone(bad), bad);
  });
});

/** Ray: "instead of a percentage, i want to designate how much is removed for best week". */
describe('the weekly prize in dollars', () => {
  it('takes exactly the dollars set for that size of field, every round', () => {
    const paid = breakdown(30, DEFAULT_PLAN, 4);
    assert.deepEqual(paid.weeklySpots, [25]);
    assert.equal(paid.weeklyTotal, 100);
    assert.equal(paid.placesPool, 30 * 50 - 100);
  });

  it('splits a band\'s dollars between its spots', () => {
    assert.deepEqual(breakdown(60, DEFAULT_PLAN, 4).weeklySpots, [30, 20]);
    assert.deepEqual(breakdown(100, DEFAULT_PLAN, 4).weeklySpots, [50, 30, 20]);
  });

  it('never takes more than the pot can cover', () => {
    const greedy = { ...DEFAULT_PLAN, weeklyTiers: [{ upTo: 1000, shares: [100], amount: 1000 }] };
    const paid = breakdown(5, greedy, 4);
    assert.ok(paid.weeklyTotal <= paid.pot);
    assert.equal(paid.weeklyTotal + sum(paid.places), paid.pot);
  });

  it('still reads an old plan written as a percentage', () => {
    const old = { ...DEFAULT_PLAN, weeklyPercent: 8, weeklyTiers: [{ upTo: 1000, shares: [100] }] };
    assert.deepEqual(breakdown(100, old, 4).weeklySpots, [100]);
  });
});

/** Ray: "we also need to put a cap on the amount of players ... the table can make an auto adjustment suggestion". */
describe('fitting the table to a player cap', () => {

  it('drops the bands nobody can reach and stretches the last one to the cap', () => {
    const fitted = fitToCap(DEFAULT_PLAN, 30);
    assert.deepEqual(fitted.tiers.map((tier) => tier.upTo), [7, 11, 19, 29, 30]);
    assert.deepEqual(fitted.weeklyTiers.map((tier) => tier.upTo), [19, 30]);
  });

  it('pays exactly the same at every size up to the cap', () => {
    const fitted = fitToCap(DEFAULT_PLAN, 30);
    for (let field = 2; field <= 30; field += 1) {
      assert.deepEqual(breakdown(field, fitted, 4), breakdown(field, DEFAULT_PLAN, 4), `field of ${field}`);
    }
  });

  it('leaves a plan with nothing out of reach alone', () => {
    assert.deepEqual(fitToCap(DEFAULT_PLAN, 1000).tiers.length, DEFAULT_PLAN.tiers.length);
  });

  it('shows ladder sizes up to the cap, and the cap itself', () => {
    assert.deepEqual(sampleSizes(30), [5, 10, 15, 20, 30]);
    assert.deepEqual(sampleSizes(24), [5, 10, 15, 20, 24]);
    assert.deepEqual(sampleSizes(null), [5, 10, 15, 20, 30, 50, 75, 100]);
  });
});
