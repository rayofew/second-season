import { useRef } from 'react';
import { toMarks } from './domain/fromrich.ts';
import type { RichNode } from './domain/fromrich.ts';

/**
 * A box where the bold looks bold.
 *
 * The first attempt was a plain text area with asterisks in it and a preview underneath, which is
 * two windows for one message and asks somebody to read their own post in a second box to find out
 * what they wrote. This is the thing everybody already knows: select some words, press B, the words
 * go bold in front of you.
 *
 * What gets saved is still plain text with marks in it. The board renders that through a parser
 * that never produces HTML, which is the entire reason posting is safe — so the editor's own markup
 * is converted on the way out and thrown away. Nothing anywhere stores or re-renders it.
 *
 * That also settles pasting. Paste whatever you like, formatted however it came: the browser puts
 * its HTML in the box, and the bold and the bullets that survive the conversion are the bold and
 * the bullets the board understands. Everything else arrives as its words.
 *
 * execCommand is deprecated and has been for years, and every browser still implements it because
 * every rich text box on the web uses it. The alternative is a thousand lines of selection
 * arithmetic for a league of fifteen people who want one line in bold.
 */

/** The DOM, reduced to the shape the conversion understands. */
function shapeOf(node: Node): RichNode {
  if (node.nodeType === Node.TEXT_NODE) return { text: node.textContent ?? '' };
  return {
    tag: (node as Element).tagName ?? 'div',
    children: [...node.childNodes].map(shapeOf),
  };
}

export interface EditorHandle {
  /** What was written, as marks. */
  marks: () => string;
  clear: () => void;
}

export function Editor({
  handle,
  placeholder,
  onChange,
}: {
  handle: { current: EditorHandle | null };
  placeholder: string;
  /** Called with whether there is anything in the box, so a Post button can know. */
  onChange: (hasText: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);

  handle.current = {
    marks: () => (box.current ? toMarks([...box.current.childNodes].map(shapeOf)) : ''),
    clear: () => {
      if (box.current) box.current.innerHTML = '';
      onChange(false);
    },
  };

  /**
   * Mouse down rather than click.
   *
   * A click has already moved focus out of the box by the time it fires, and with it the selection
   * the button was meant to act on. Refusing the default on mousedown keeps the words highlighted.
   */
  const apply = (command: string, value?: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    box.current?.focus();
    document.execCommand(command, false, value);
    onChange(Boolean(box.current?.textContent?.trim()));
  };

  return (
    <div className="editor">
      <div className="editorbar">
        <button type="button" title="Bold" onMouseDown={apply('bold')}><b>B</b></button>
        <button type="button" title="Italic" onMouseDown={apply('italic')}><i>I</i></button>
        <span className="barsplit" />
        <button type="button" title="Heading" onMouseDown={apply('formatBlock', 'h1')}>H</button>
        <button type="button" title="Smaller heading" onMouseDown={apply('formatBlock', 'h2')}>
          <span className="smallh">H</span>
        </button>
        <button type="button" title="Normal text" onMouseDown={apply('formatBlock', 'div')}>¶</button>
        <span className="barsplit" />
        <button type="button" title="Bulleted list" onMouseDown={apply('insertUnorderedList')}>•</button>
        <span className="barsplit" />
        <button type="button" title="Clear formatting" onMouseDown={apply('removeFormat')}>⌫</button>
      </div>

      <div
        ref={box}
        className="editorbox"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Your message"
        data-placeholder={placeholder}
        onInput={() => onChange(Boolean(box.current?.textContent?.trim()))}
      />
    </div>
  );
}
