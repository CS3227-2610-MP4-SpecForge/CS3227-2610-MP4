import type { ReactNode } from "react";

function renderEmphasis(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  const openings: { delimiter: string; index: number; slot: number }[] = [];
  let end = 0;
  for (const { 0: delimiter, index } of text.matchAll(/\\(?:\\|\*+|_+)|\*+|_+/g)) {
    if (delimiter !== "*" && delimiter !== "_" && delimiter !== "**") continue;
    const before = text[index - 1] ?? "";
    const after = text[index + delimiter.length] ?? "";
    if (
      delimiter === "_" &&
      /[\p{L}\p{M}\p{N}]$/u.test(text.substring(index - 2, index)) &&
      /^[\p{L}\p{M}\p{N}]/u.test(text.slice(index + 1, index + 3))
    )
      continue;

    const match = openings.findLastIndex(opening => opening.delimiter === delimiter);
    if (match !== -1 && /\S/.test(before)) {
      const { slot, index: start } = openings[match];
      const children = nodes.splice(slot + 1);
      children.push(text.slice(end, index));
      nodes[slot] = delimiter === "**" ? <strong key={start}>{children}</strong> : <em key={start}>{children}</em>;
      openings.length = match;
    } else if (/\S/.test(after)) {
      // Keep each opener as text until it closes. At most one per delimiter can be open.
      if (match !== -1) openings.splice(match, 1);
      nodes.push(text.slice(end, index), delimiter);
      openings.push({ delimiter, index, slot: nodes.length - 1 });
    } else {
      continue;
    }
    end = index + delimiter.length;
  }
  return nodes.length ? [...nodes, text.slice(end)] : text;
}

// Deliberately small Markdown surface. User content stays in React text
// children, so HTML, links and images cannot execute or fetch resources.
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) {
      i++;
      continue;
    }
    const key = i;
    if (/^\s*```/.test(lines[i])) {
      i++;
      const code: string[] = [];
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(
        <pre key={key}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = lines[i].match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) {
      i++;
      const content = renderEmphasis(heading[2]);
      blocks.push(heading[1].length <= 2 ? <h2 key={key}>{content}</h2> : <h3 key={key}>{content}</h3>);
      continue;
    }
    const list = lines[i].match(/^\s*(?:([-*+])|\d+\.)\s+(.+)$/);
    if (list) {
      const items: ReactNode[] = [];
      const ordered = !list[1];
      const pattern = ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/;
      while (i < lines.length) {
        const item = lines[i].match(pattern);
        if (!item) break;
        items.push(<li key={i++}>{renderEmphasis(item[1])}</li>);
      }
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
      continue;
    }
    const paragraph: string[] = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !/^\s*(?:#{1,6}\s|```|[-*+]\s|\d+\.\s)/.test(lines[i]))
      paragraph.push(lines[i++]);
    blocks.push(<p key={key}>{renderEmphasis(paragraph.join("\n"))}</p>);
  }
  return <div className="markdown">{blocks}</div>;
}
