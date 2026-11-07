import { assistanceMessages } from "../assistance";
import type { RequestFields } from "../requests";
import { taskFields } from "./requests";
import { invalidOutput, type AiReply } from "./soc";

type Section = { start: number; end: number; body: number };
function acceptanceSection(text: string): Section | null {
  const headings: { start: number; body: number; level: number; acceptance: boolean }[] = [];
  let offset = 0;
  let fence: { marker: string; length: number } | null = null;
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = { marker: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.marker && marker[1].length >= fence.length && line.slice(marker[0].length).trim() === "") fence = null;
    } else if (!fence) {
      // These section styles are deliberately unsupported. Reject them rather
      // than letting a recognized criteria section swallow a later section.
      if (/^ {0,3}(?:={2,}|-{2,})\s*$/.test(line) || /^\s*(?:\*\*.+\*\*|__.+__)\s*$/.test(line)) throw invalidOutput("unsafe_section");
      const atx = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      const plain = line.match(/^([\p{L}][\p{L}\p{N} /_-]*):\s*$/u);
      const name = (atx?.[2] ?? plain?.[1] ?? "").trim().replace(/:$/, "").toLowerCase();
      if (atx || plain) headings.push({ start: offset, body: offset + line.length, level: atx ? atx[1].length : 2, acceptance: name === "acceptance criteria" });
      else if (/^\s*(?:\*\*)?acceptance criteria(?:\*\*)?\s*$/i.test(line)) throw invalidOutput("unsafe_section");
    }
    offset += line.length;
  }
  if (fence) throw invalidOutput("unsafe_section");
  const targets = headings.filter(heading => heading.acceptance);
  if (targets.length > 1) throw invalidOutput("unsafe_section");
  if (!targets.length) return null;
  const target = targets[0];
  return { ...target, end: headings.find(heading => heading.start > target.start && heading.level <= target.level)?.start ?? text.length };
}

export function constrainSuggestion(message: string, fields: RequestFields, result: AiReply): AiReply {
  if (message === assistanceMessages.gaps) return { ...result, proposal: null };
  if (message !== assistanceMessages.acceptance || !result.proposal) return result;
  const suggested = acceptanceSection(result.proposal.description);
  if (!suggested || !result.proposal.description.slice(suggested.body, suggested.end).trim()) throw invalidOutput("unsafe_section");
  const section = result.proposal.description.slice(suggested.start, suggested.end).trimEnd();
  const current = acceptanceSection(fields.description);
  const description = current
    ? fields.description.slice(0, current.start) + section + (current.end < fields.description.length ? "\n\n" : "") + fields.description.slice(current.end)
    : fields.description + (fields.description ? fields.description.endsWith("\n\n") ? "" : fields.description.endsWith("\n") ? "\n" : "\n\n" : "") + section;
  const proposal = taskFields.safeParse({ title: fields.title, description });
  if (!proposal.success || !proposal.data.title.trim()) throw invalidOutput("unsafe_section");
  return { ...result, proposal: proposal.data };
}
