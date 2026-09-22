import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inline, markup, plain } from '../src/domain/markup.ts';

describe('formatting on the board', () => {
  it('makes a line bold', () => {
    assert.deepEqual(inline('Picks are **due Thursday**'), [
      { kind: 'text', text: 'Picks are ' },
      { kind: 'bold', text: 'due Thursday' },
    ]);
  });

  it('takes either mark for italics', () => {
    assert.deepEqual(inline('*so* _close_'), [
      { kind: 'italic', text: 'so' },
      { kind: 'text', text: ' ' },
      { kind: 'italic', text: 'close' },
    ]);
  });

  it('finds a link before it finds emphasis', () => {
    // A URL can contain underscores and asterisks. Finding emphasis first would put the middle of
    // https://example.com/a_b_c in italics and break the link.
    assert.deepEqual(inline('see https://example.com/a_b_c now'), [
      { kind: 'text', text: 'see ' },
      { kind: 'link', text: 'https://example.com/a_b_c', href: 'https://example.com/a_b_c' },
      { kind: 'text', text: ' now' },
    ]);
  });

  it('leaves a full stop outside the link, where a sentence puts it', () => {
    const spans = inline('at https://playoffs.spiteapps.app.');
    assert.deepEqual(spans[1], {
      kind: 'link', text: 'https://playoffs.spiteapps.app', href: 'https://playoffs.spiteapps.app',
    });
    assert.deepEqual(spans[2], { kind: 'text', text: '.' });
  });

  it('links nothing but http and https', () => {
    // A javascript: URL somebody has typed hopefully is a string of words, and stays one.
    assert.deepEqual(inline('javascript:alert(1)'), [{ kind: 'text', text: 'javascript:alert(1)' }]);
    assert.deepEqual(inline('mailto:a@b.com'), [{ kind: 'text', text: 'mailto:a@b.com' }]);
  });

  it('treats anything that looks like a tag as the words it is', () => {
    // The whole safety argument: this produces values, never markup, so there is no path from a
    // post to anything running. No sanitiser to get wrong.
    assert.deepEqual(inline('<script>alert(1)</script>'), [
      { kind: 'text', text: '<script>alert(1)</script>' },
    ]);
  });

  it('builds headings, bullets and paragraphs', () => {
    const blocks = markup('# Wild Card\nsome words\n\n- one\n- two\nafter');
    assert.deepEqual(blocks.map((block) => block.kind), ['heading', 'para', 'bullets', 'para']);
    assert.equal(blocks[0]!.kind === 'heading' && blocks[0]!.level, 1);
    assert.equal(blocks[2]!.kind === 'bullets' && blocks[2]!.items.length, 2);
  });

  it('keeps two lines as two lines, because somebody pressed return', () => {
    const blocks = markup('first\nsecond');
    assert.equal(blocks.length, 2);
  });

  it('survives a post that is nothing but marks', () => {
    assert.doesNotThrow(() => markup('***\n**\n- \n# '));
  });

  it('strips the marks for anywhere that cannot show them', () => {
    // An email body is the one that matters: asterisks in a mail client are just asterisks.
    assert.equal(plain('**Due Thursday** and _no excuses_'), 'Due Thursday and no excuses');
    assert.equal(plain('# Wild Card\n- one\n- two'), 'Wild Card\n• one\n• two');
  });
});
