import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { weekTable } from '../src/domain/weekly.ts';
import type { WeekEntry } from '../src/domain/weekly.ts';

const SLOTS = ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'FLEX', 'K', 'DEF'];

const entry = (entryId: string, bySlot: Record<string, number>): WeekEntry => ({ entryId, bySlot });
const names = (table: { entryId: string }[]) => table.map((placing) => placing.entryId);

describe('the weekly prize', () => {
  it('goes to the most raw points, multipliers ignored', () => {
    // The whole point: winnable by somebody whose contest is already over.
    const table = weekTable([entry('A', { QB: 20, RB1: 10 }), entry('B', { QB: 5, RB1: 40 })], SLOTS);
    assert.deepEqual(names(table), ['B', 'A']);
    assert.equal(table[0]!.raw, 45);
  });

  it('breaks a tie on the quarterback', () => {
    const table = weekTable([entry('A', { QB: 10, RB1: 20 }), entry('B', { QB: 20, RB1: 10 })], SLOTS);
    assert.deepEqual(names(table), ['B', 'A'], 'level on 30, but B had the better quarterback');
    assert.equal(table[1]!.decidedAt, 'QB');
  });

  it('keeps adding down the roster until somebody is ahead', () => {
    // Same quarterback, same first back — the second back settles it.
    const a = entry('A', { QB: 20, RB1: 10, RB2: 5, WR1: 15 });
    const b = entry('B', { QB: 20, RB1: 10, RB2: 12, WR1: 8 });
    const table = weekTable([a, b], SLOTS);
    assert.deepEqual(names(table), ['B', 'A']);
    assert.equal(table[1]!.decidedAt, 'RB2');
  });

  it('shares it when two managers scored identically everywhere', () => {
    const same = { QB: 20, RB1: 10, WR1: 5 };
    const table = weekTable([entry('A', same), entry('B', same)], SLOTS);
    assert.deepEqual([table[0]!.rank, table[1]!.rank], [1, 1]);
    assert.equal(table[0]!.decidedAt, null);
  });

  it('is not fooled by the same total arriving in a different order', () => {
    // Both scored 40, and every prefix matters: A is ahead from the quarterback onwards.
    const a = entry('A', { QB: 40 });
    const b = entry('B', { DEF: 40 });
    const table = weekTable([a, b], SLOTS);
    assert.deepEqual(names(table), ['A', 'B']);
    assert.equal(table[1]!.decidedAt, 'QB');
  });
});
