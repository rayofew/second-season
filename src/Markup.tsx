import { markup } from './domain/markup.ts';
import type { Inline } from './domain/markup.ts';

/**
 * A post, rendered.
 *
 * Every node here is built from plain values that domain/markup.ts produced — there is no HTML
 * anywhere in the pipeline and no sanitiser standing between a post and the page. React escapes
 * text by construction, so a message containing a script tag renders the words and that is the end
 * of it. That property is worth more than any amount of formatting.
 */

function Spans({ spans }: { spans: Inline[] }) {
  return (
    <>
      {spans.map((span, index) => {
        if (span.kind === 'bold') return <strong key={index}>{span.text}</strong>;
        if (span.kind === 'italic') return <em key={index}>{span.text}</em>;
        if (span.kind === 'link') {
          return (
            // Opened away from the app, and told not to hand the new page a reference back.
            <a key={index} href={span.href} target="_blank" rel="noreferrer noopener">
              {span.text}
            </a>
          );
        }
        return <span key={index}>{span.text}</span>;
      })}
    </>
  );
}

export function Markup({ text }: { text: string }) {
  return (
    <div className="posttext">
      {markup(text).map((block, index) => {
        if (block.kind === 'heading') {
          return block.level === 1
            ? <h3 key={index} className="postbig"><Spans spans={block.spans} /></h3>
            : <h4 key={index} className="postsub"><Spans spans={block.spans} /></h4>;
        }
        if (block.kind === 'bullets') {
          return (
            <ul key={index} className="postlist">
              {block.items.map((item, at) => <li key={at}><Spans spans={item} /></li>)}
            </ul>
          );
        }
        return <p key={index}><Spans spans={block.spans} /></p>;
      })}
    </div>
  );
}
