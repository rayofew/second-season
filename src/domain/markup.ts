/**
 * A little formatting on the board, and not one character of HTML.
 *
 * People write in a group chat the way they write anywhere — a bold line for the thing that
 * matters, a list of who is out — and a board that renders all of it as one grey paragraph invites
 * nobody to use it twice.
 *
 * So a small, closed set of marks. Bold, italic, two sizes of heading, bullets, and links. Anything
 * else somebody types is text, including anything that looks like a tag: this produces a tree of
 * plain values which the component turns into React elements, so a post containing a script tag
 * renders the words "script tag" and there is no path by which it could do anything else. No
 * dangerouslySetInnerHTML, no sanitiser to get wrong, nothing to keep up with.
 *
 * Deliberately not Markdown. Markdown is a large language with tables and footnotes and reference
 * links, and every part of it is another thing to render, test and explain to somebody who only
 * wanted to make one line bold.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'link'; text: string; href: string };

export type Block =
  | { kind: 'heading'; level: 1 | 2; spans: Inline[] }
  | { kind: 'para'; spans: Inline[] }
  | { kind: 'bullets'; items: Inline[][] };

/**
 * Links first, then bold, then italic.
 *
 * Order matters: a URL can contain underscores and asterisks, and finding it first stops
 * https://example.com/a_b_c from arriving with its middle in italics.
 */
const LINK = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?]/g;
const BOLD = /\*\*([^*]+)\*\*/g;
const ITALIC = /(?:\*([^*\n]+)\*|_([^_\n]+)_)/g;

/** Splits on one pattern, handing the pieces between matches on to whatever comes next. */
function split(
  text: string,
  pattern: RegExp,
  made: (match: RegExpExecArray) => Inline,
  rest: (text: string) => Inline[],
): Inline[] {
  const spans: Inline[] = [];
  let at = 0;
  pattern.lastIndex = 0;

  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > at) spans.push(...rest(text.slice(at, match.index)));
    spans.push(made(match));
    at = match.index + match[0].length;
  }
  if (at < text.length) spans.push(...rest(text.slice(at)));
  return spans;
}

const plainSpan = (text: string): Inline[] => (text ? [{ kind: 'text', text }] : []);

const italics = (text: string): Inline[] =>
  split(text, ITALIC, (match) => ({ kind: 'italic', text: match[1] ?? match[2] ?? '' }), plainSpan);

const bolds = (text: string): Inline[] =>
  split(text, BOLD, (match) => ({ kind: 'bold', text: match[1]! }), italics);

export function inline(text: string): Inline[] {
  // Only http and https become links. Anything else — a mailto, a javascript: URL somebody has
  // typed hopefully — stays as the words it is.
  return split(text, LINK, (match) => ({ kind: 'link', text: match[0], href: match[0] }), bolds);
}

export function markup(text: string): Block[] {
  const blocks: Block[] = [];
  let bullets: Inline[][] | null = null;

  const closeList = () => {
    if (bullets && bullets.length > 0) blocks.push({ kind: 'bullets', items: bullets });
    bullets = null;
  };

  for (const line of text.split('\n')) {
    const trimmed = line.trim();

    if (trimmed === '') { closeList(); continue; }

    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      bullets ??= [];
      bullets.push(inline(bullet[1]!));
      continue;
    }
    closeList();

    const heading = /^(#{1,2})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1]!.length as 1 | 2, spans: inline(heading[2]!) });
      continue;
    }

    // Consecutive lines stay separate paragraphs rather than being joined, because somebody who
    // pressed return meant to press return.
    blocks.push({ kind: 'para', spans: inline(trimmed) });
  }

  closeList();
  return blocks;
}

/**
 * The same words with the marks taken off, for anywhere that cannot show them.
 *
 * An email body is the one that matters: asterisks in a mail client are just asterisks.
 */
export function plain(text: string): string {
  return text
    .replace(BOLD, '$1')
    .replace(ITALIC, (_, star, bar) => star ?? bar ?? '')
    .replace(/^(#{1,2})\s+/gm, '')
    .replace(/^[-*•]\s+/gm, '• ');
}
