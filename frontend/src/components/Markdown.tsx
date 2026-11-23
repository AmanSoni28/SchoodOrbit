import type { ReactNode } from 'react';

// Minimal, XSS-safe markdown: builds React elements (never innerHTML).
// Supports ## / ### headings, - bullet lists, **bold**, `code`, and paragraphs.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong>
    : part.startsWith('`') && part.endsWith('`') ? <code key={i}>{part.slice(1, -1)}</code>
    : part);
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <div className="prose-lms">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*[-*] /.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*] /, ''))}</li>)}</ul>;
        if (b.startsWith('### ')) return <div key={i}><h3>{inline(lines[0].slice(4))}</h3>{lines.length > 1 && <Markdown text={lines.slice(1).join('\n')} />}</div>;
        if (b.startsWith('## ')) return <div key={i}><h2>{inline(lines[0].slice(3))}</h2>{lines.length > 1 && <Markdown text={lines.slice(1).join('\n')} />}</div>;
        return <p key={i}>{lines.flatMap((l, j) => (j ? [<br key={`br${j}`} />, ...inline(l)] : inline(l)))}</p>;
      })}
    </div>
  );
}
