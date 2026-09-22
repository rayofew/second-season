/**
 * What a rich editor produced, turned back into marks.
 *
 * The board stores text with marks in it — **bold**, a leading dash for a bullet — and renders that
 * through a parser which never produces HTML. That property is the whole reason the board is safe,
 * and it is not worth giving up for a nicer editing experience.
 *
 * So the editor is allowed to be a rich one, and its output is converted here on the way to being
 * saved. What is stored is the same plain text it always was; what somebody types into is a box
 * where the bold looks bold. Nothing ever stores or renders the editor's own HTML.
 *
 * Written against a tiny node shape rather than the DOM so the conversion can be tested without a
 * browser. The adapter that turns real nodes into this shape is four lines and lives in the editor.
 */

export interface RichText { text: string }
export interface RichElement { tag: string; children: RichNode[] }
export type RichNode = RichText | RichElement;

const isText = (node: RichNode): node is RichText => 'text' in node;

/** Marks that wrap their content, keyed by the tags a browser actually emits for them. */
const WRAPS: Record<string, string> = {
  b: '**', strong: '**',
  i: '_', em: '_',
};

/** Tags that start their line with something. */
const PREFIX: Record<string, string> = { h1: '# ', h2: '## ', h3: '## ', li: '- ' };

/**
 * Tags that start a new line.
 *
 * Not br, which ends one instead — counting it both ways turned every single line break into a
 * blank line, and pressing return twice is how an editor makes a paragraph.
 */
const BREAKS = new Set(['div', 'p', 'li', 'h1', 'h2', 'h3', 'ul', 'ol', 'blockquote']);

function walk(nodes: readonly RichNode[], out: string[]): void {
  for (const node of nodes) {
    if (isText(node)) { out.push(node.text); continue; }

    const tag = node.tag.toLowerCase();
    const wrap = WRAPS[tag];
    const prefix = PREFIX[tag];

    // A break before, so a new block starts on its own line — unless we are already at one.
    if (BREAKS.has(tag) && out.join('').length > 0 && !out.join('').endsWith('\n')) out.push('\n');
    if (prefix) out.push(prefix);

    if (wrap) {
      const inner: string[] = [];
      walk(node.children, inner);
      // An empty pair of marks is four characters of nothing, and reads as a typo.
      const said = inner.join('');
      if (said.trim()) out.push(`${wrap}${said}${wrap}`);
      else out.push(said);
    } else {
      walk(node.children, out);
    }

    if (tag === 'br') out.push('\n');
  }
}

export function toMarks(nodes: readonly RichNode[]): string {
  const out: string[] = [];
  walk(nodes, out);

  return out.join('')
    // A non-breaking space is what a browser leaves behind in an empty line.
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
