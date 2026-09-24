import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { news, storiesFor } from '../src/domain/news.ts';
import type { RawNews } from '../src/domain/news.ts';

const article = (headline: string, published: string, ...athletes: number[]) => ({
  headline,
  description: `about ${headline}`,
  published,
  links: { web: { href: `https://espn.com/${headline.replace(/\s/g, '-')}` } },
  categories: [
    { type: 'league', id: 1 },
    ...athletes.map((athleteId) => ({ type: 'athlete', athleteId })),
  ],
});

const RAW: RawNews = {
  articles: [
    article('Older piece', '2026-09-20T10:00:00Z', 111),
    article('Newest piece', '2026-09-24T10:00:00Z', 111, 222),
    article('Middle piece', '2026-09-22T10:00:00Z', 111),
    article('Untagged piece', '2026-09-23T10:00:00Z'),
  ],
};

describe('what has been written about a player', () => {
  it('turns a league feed inside out into a list per player', () => {
    // ESPN has no per-player feed — asking for one returns nothing — but most articles say who
    // they are about.
    const all = news(RAW);
    assert.deepEqual(storiesFor(all, '111').map((story) => story.headline),
      ['Newest piece', 'Middle piece', 'Older piece']);
    assert.deepEqual(storiesFor(all, '222').map((story) => story.headline), ['Newest piece']);
  });

  it('puts the newest first, because that is the one that changes a decision', () => {
    assert.equal(storiesFor(news(RAW), '111')[0]!.headline, 'Newest piece');
  });

  it('keeps four, because a card is a scan and not a reading list', () => {
    const many: RawNews = {
      articles: Array.from({ length: 9 }, (_, index) =>
        article(`Piece ${index}`, `2026-09-${10 + index}T10:00:00Z`, 111)),
    };
    assert.equal(storiesFor(news(many), '111').length, 4);
  });

  it('does not tell the same story twice', () => {
    const twice: RawNews = { articles: [article('Same', '2026-09-24T10:00:00Z', 111, 111)] };
    assert.equal(storiesFor(news(twice), '111').length, 1);
  });

  it('ignores an article that names nobody', () => {
    const all = news(RAW);
    assert.ok(![...all.values()].flat().some((story) => story.headline === 'Untagged piece'));
  });

  it('gives nothing rather than nonsense', () => {
    assert.deepEqual(storiesFor(news({}), '111'), []);
    assert.deepEqual(storiesFor(null, '111'), []);
    assert.deepEqual(storiesFor(news(RAW), undefined), [], 'a man with no id has no news');
  });
});
