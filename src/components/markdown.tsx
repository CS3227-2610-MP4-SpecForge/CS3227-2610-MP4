import type { ReactNode } from "react";
// Deliberately small Markdown surface: headings, lists, paragraphs and fenced
// code. Everything is a React text child. HTML, links and images never execute
// or fetch remote content; unsupported syntax stays readable as literal text.
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []; const lines = text.split(/\r?\n/); let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    const key = i;
    if (/^\s*```/.test(lines[i])) {
      i++; const code: string[] = []; while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(<pre key={key}><code>{code.join("\n")}</code></pre>); continue;
    }
    const heading = lines[i].match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) { i++; blocks.push(heading[1].length <= 2 ? <h2 key={key}>{heading[2]}</h2> : <h3 key={key}>{heading[2]}</h3>); continue; }
    const list = lines[i].match(/^\s*(?:([-*+])|\d+\.)\s+(.+)$/);
    if (list) {
      const items: ReactNode[] = []; const ordered = !list[1]; const pattern = ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/;
      while (i < lines.length) { const item = lines[i].match(pattern); if (!item) break; items.push(<li key={i++}>{item[1]}</li>); }
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>); continue;
    }
    const paragraph: string[] = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !/^\s*(?:#{1,6}\s|```|[-*+]\s|\d+\.\s)/.test(lines[i])) paragraph.push(lines[i++]);
    blocks.push(<p key={key}>{paragraph.join("\n")}</p>);
  }
  return <div className="markdown">{blocks}</div>;
}
