import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toMarks } from '../src/domain/fromrich.ts';
import type { RichNode } from '../src/domain/fromrich.ts';
import { markup } from '../src/domain/markup.ts';

const text = (value: string): RichNode => ({ text: value });
const el = (tag: string, ...children: RichNode[]): RichNode => ({ tag, children });

describe('what the editor produced, turned back into marks', () => {
  it('turns bold into bold, whichever tag the browser used', () => {
    assert.equal(toMarks([text('Picks are '), el('b', text('due Thursday'))]), 'Picks are **due Thursday**');
    assert.equal(toMarks([el('strong', text('now'))]), '**now**');
  });

  it('turns italics into italics', () => {
    assert.equal(toMarks([el('i', text('so'))]), '_so_');
    assert.equal(toMarks([el('em', text('close'))]), '_close_');
  });

  it('turns a list into dashes', () => {
    const list = el('ul', el('li', text('one')), el('li', text('two')));
    assert.equal(toMarks([list]), '- one\n- two');
  });

  it('turns the divs a browser makes on Enter into line breaks', () => {
    assert.equal(toMarks([text('first'), el('div', text('second'))]), 'first\nsecond');
    assert.equal(toMarks([text('a'), el('br'), text('b')]), 'a\nb');
  });

  it('keeps bold inside a bullet', () => {
    const list = el('ul', el('li', text('held by '), el('b', text('six'))));
    assert.equal(toMarks([list]), '- held by **six**');
  });

  it('drops an empty pair of marks rather than storing four characters of nothing', () => {
    // Pressing bold and then changing your mind leaves a stray <b></b> behind.
    assert.equal(toMarks([text('a'), el('b'), text('b')]), 'ab');
  });

  it('turns the space a browser leaves in an empty line back into a space', () => {
    assert.equal(toMarks([text('a b')]), 'a b');
  });

  it('reads two presses of return as a paragraph break', () => {
    // A browser writes that as a div holding nothing but a br, which is the shape to get right.
    assert.equal(toMarks([text('a'), el('div', el('br')), el('div', text('b'))]), 'a\n\nb');
  });

  it('round trips: what comes out reads back as what went in', () => {
    // The two halves have to agree or a post looks different the moment it is saved.
    const nodes = [el('h1', text('Wild Card')), el('div', el('b', text('Chris K.')), text(' takes it'))];
    const blocks = markup(toMarks(nodes));
    assert.deepEqual(blocks.map((block) => block.kind), ['heading', 'para']);
    assert.equal(blocks[1]!.kind === 'para' && blocks[1]!.spans[0]!.kind, 'bold');
  });
});
