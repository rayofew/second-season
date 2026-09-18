import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sinceWords } from '../src/domain/seen.ts';

const NOW = new Date('2026-09-17T14:30:00');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('how long ago somebody was last in', () => {
  it('says never for somebody who has not opened it', () => {
    assert.equal(sinceWords(undefined, NOW), 'never');
    assert.equal(sinceWords(null, NOW), 'never');
  });

  it('rounds the first minute down to just now', () => {
    assert.equal(sinceWords(ago(20_000), NOW), 'just now');
    assert.equal(sinceWords(ago(3 * MINUTE), NOW), '3 minutes ago');
    assert.equal(sinceWords(ago(MINUTE), NOW), '1 minute ago', 'singular, not "1 minutes"');
  });

  it('counts hours within the day', () => {
    assert.equal(sinceWords(ago(2 * HOUR), NOW), '2 hours ago');
    assert.equal(sinceWords(ago(HOUR), NOW), '1 hour ago');
  });

  it('counts whole days rather than blocks of twenty-four hours', () => {
    // Half past eleven last night is yesterday at half past two, not fifteen hours ago.
    assert.equal(sinceWords(new Date('2026-09-16T23:30:00'), NOW), 'yesterday');
    assert.equal(sinceWords(new Date('2026-09-14T09:00:00'), NOW), '3 days ago');
  });

  it('keeps the same morning in hours, not days', () => {
    assert.equal(sinceWords(new Date('2026-09-17T09:00:00'), NOW), '5 hours ago');
  });

  it('gives a date once the relative form stops meaning anything', () => {
    const old = sinceWords(new Date('2026-08-20T10:00:00'), NOW);
    assert.ok(!old.includes('ago'), `expected a date, got ${old}`);
    assert.match(old, /\d/);
  });

  it('treats a clock slightly ahead of ours as now rather than the future', () => {
    assert.equal(sinceWords(new Date(NOW.getTime() + 30_000), NOW), 'just now');
  });
});
