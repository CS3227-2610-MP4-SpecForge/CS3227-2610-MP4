import type { RequestFields } from "./requests";

// A suggestion split into independently reviewable changes. Each change is a
// run of changed lines located by its lines plus the unchanged line on each
// side; null context means the start or end of the field. While the field is
// exactly its original or proposed text, the change is instead placed at the
// line index the diff found there (beforeAt or afterAt).
export type ChangeField = keyof RequestFields;
export type TicketChange = {
  id: string;
  field: ChangeField;
  before: string;
  after: string;
  beforeLines: string[];
  afterLines: string[];
  lead: string | null;
  trail: string | null;
  fieldBefore: string;
  fieldAfter: string;
  beforeAt: number;
  afterAt: number;
};
export type ChangeStatus = "open" | "applied" | "outdated";
export type DiffRow = { kind: "same"; field: ChangeField; lines: string[] } | { kind: "change"; change: TicketChange };
export type WordPart = { text: string; changed: boolean };

// Bounds the quadratic diff tables; larger inputs fall back to coarser output.
const tableLimit = 4_000_000;
const fieldOrder: ChangeField[] = ["title", "description"];

// Longest-common-subsequence alignment returning matched index pairs.
function align<T>(a: T[], b: T[]): [number, number][] {
  if (a.length * b.length > tableLimit) {
    let start = 0;
    let end = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
    return [
      ...Array.from({ length: start }, (_, i): [number, number] => [i, i]),
      ...Array.from({ length: end }, (_, i): [number, number] => [a.length - end + i, b.length - end + i]),
    ];
  }
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i++;
    else j++;
  }
  return pairs;
}

function fieldRows(field: ChangeField, before: string, after: string): DiffRow[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  let count = 0;
  for (const [ai, bj] of [...align(a, b), [a.length, b.length] as [number, number]]) {
    if (ai > i || bj > j) {
      const beforeLines = a.slice(i, ai);
      const afterLines = b.slice(j, bj);
      rows.push({
        kind: "change",
        change: {
          id: `${field}:${count++}`,
          field,
          before: beforeLines.join("\n"),
          after: afterLines.join("\n"),
          beforeLines,
          afterLines,
          lead: i > 0 ? a[i - 1] : null,
          trail: ai < a.length ? a[ai] : null,
          fieldBefore: before,
          fieldAfter: after,
          beforeAt: i,
          afterAt: j,
        },
      });
    }
    if (ai < a.length) {
      const last = rows.at(-1);
      if (last?.kind === "same") last.lines.push(a[ai]);
      else rows.push({ kind: "same", field, lines: [a[ai]] });
    }
    i = ai + 1;
    j = bj + 1;
  }
  return rows;
}

/** Title row(s) first, then the description, with unchanged runs kept for display. */
export function ticketDiff(before: RequestFields, after: RequestFields): DiffRow[] {
  return fieldOrder.flatMap(field =>
    before[field] === after[field] ? [] : fieldRows(field, before[field], after[field]),
  );
}

export function ticketChanges(before: RequestFields, after: RequestFields): TicketChange[] {
  return ticketDiff(before, after).flatMap(row => (row.kind === "change" ? [row.change] : []));
}

type Match = { start: number; from: number; to: number };
// Every place the block (lines plus context) occurs: where the block starts and
// the line span it covers including its context.
function locate(change: TicketChange, lines: string[], block: string[]) {
  const found: Match[] = [];
  const first = change.lead === null ? 0 : 1;
  for (let s = 0; s + first + block.length <= lines.length; s++) {
    if (change.lead === null ? s > 0 : lines[s] !== change.lead) {
      if (change.lead === null) break;
      continue;
    }
    const start = s + first;
    const end = start + block.length;
    if (!block.every((line, k) => lines[start + k] === line)) continue;
    if (change.trail === null ? end !== lines.length : lines[end] !== change.trail) continue;
    found.push({ start, from: s, to: change.trail === null ? end : end + 1 });
  }
  return found;
}

// The shorter of the original and proposed blocks can also occur inside an
// occurrence of the longer one (an inserted paragraph keeps the blank line
// before it, for example). Such nested matches are part of the longer match,
// not separate occurrences.
function occurrences(change: TicketChange, fields: RequestFields) {
  const text = fields[change.field];
  const lines = text.split("\n");
  const at = (start: number, length: number): Match => ({
    start,
    from: change.lead === null ? start : start - 1,
    to: start + length + (change.trail === null ? 0 : 1),
  });
  if (text === change.fieldBefore)
    return { lines, original: [at(change.beforeAt, change.beforeLines.length)], proposed: [] };
  if (text === change.fieldAfter)
    return { lines, original: [], proposed: [at(change.afterAt, change.afterLines.length)] };
  let original = locate(change, lines, change.beforeLines);
  let proposed = locate(change, lines, change.afterLines);
  const inside = (outer: Match[]) => (match: Match) =>
    !outer.some(span => span.from <= match.from && match.to <= span.to);
  if (change.beforeLines.length < change.afterLines.length) original = original.filter(inside(proposed));
  else proposed = proposed.filter(inside(original));
  return { lines, original, proposed };
}

export function changeStatus(change: TicketChange, fields: RequestFields): ChangeStatus {
  const { original, proposed } = occurrences(change, fields);
  if (original.length === 1 && proposed.length === 0) return "open";
  if (proposed.length === 1 && original.length === 0) return "applied";
  return "outdated";
}

function swap(change: TicketChange, fields: RequestFields, forward: boolean) {
  const { lines, original, proposed } = occurrences(change, fields);
  const [from, to] = forward ? [original, proposed] : [proposed, original];
  if (from.length !== 1 || to.length !== 0) return null;
  const [removed, inserted] = forward
    ? [change.beforeLines, change.afterLines]
    : [change.afterLines, change.beforeLines];
  lines.splice(from[0].start, removed.length, ...inserted);
  return { ...fields, [change.field]: lines.join("\n") };
}

/** The ticket with this change applied, or null when it is not open. */
export function applyChange(change: TicketChange, fields: RequestFields) {
  return swap(change, fields, true);
}

/** The ticket with this change reverted, or null when it is not applied. */
export function undoChange(change: TicketChange, fields: RequestFields) {
  return swap(change, fields, false);
}

/**
 * The ticket with every open change among these applied at once. All are
 * located in the same snapshot and spliced from the bottom up, so applying one
 * cannot move or blur another's anchor. A change is skipped when it is not
 * open or its lines or context overlap an earlier change in the batch; pass
 * only open changes when every skip should mean an overlap.
 */
export function applyChanges(changes: TicketChange[], fields: RequestFields) {
  const taken: { change: TicketChange; match: Match }[] = [];
  const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b;
  const clashes = (one: (typeof taken)[number], two: (typeof taken)[number]) =>
    one.change.field === two.change.field &&
    (one.match.start === two.match.start ||
      overlaps(one.match.start, one.match.start + one.change.beforeLines.length, two.match.from, two.match.to) ||
      overlaps(two.match.start, two.match.start + two.change.beforeLines.length, one.match.from, one.match.to));
  let skipped = 0;
  for (const change of changes) {
    const { original, proposed } = occurrences(change, fields);
    const candidate = original.length === 1 && proposed.length === 0 ? { change, match: original[0] } : null;
    if (candidate && !taken.some(other => clashes(other, candidate))) taken.push(candidate);
    else skipped++;
  }
  const next = { ...fields };
  for (const field of fieldOrder) {
    const edits = taken.filter(({ change }) => change.field === field).sort((x, y) => y.match.start - x.match.start);
    if (edits.length === 0) continue;
    const lines = fields[field].split("\n");
    for (const { change, match } of edits) lines.splice(match.start, change.beforeLines.length, ...change.afterLines);
    next[field] = lines.join("\n");
  }
  return { fields: next, skipped };
}

export function summarizeChanges(changes: TicketChange[]) {
  const title = changes.some(change => change.field === "title");
  const description = changes.filter(change => change.field === "description").length;
  const total = changes.length;
  const noun = `${total} change${total === 1 ? "" : "s"}`;
  if (title && description) return `${noun}: title and ${description} in Description`;
  if (title) return `${noun}: title`;
  return `${noun} in Description`;
}

/** Card status from the current ticket and this page's rejections. */
export function reviewStatus(changes: TicketChange[], fields: RequestFields, rejected: ReadonlySet<string>) {
  const statuses = changes.map(change => changeStatus(change, fields));
  const applied = statuses.filter(status => status === "applied").length;
  const open = changes.filter((change, at) => statuses[at] === "open" && !rejected.has(change.id)).length;
  const decided = applied > 0 || changes.some((change, at) => statuses[at] !== "applied" && rejected.has(change.id));
  if (changes.length > 0 && applied === changes.length) return "All applied";
  if (open > 0) return decided ? `${applied} of ${changes.length} applied` : "Not reviewed";
  if (applied > 0) return `${applied} of ${changes.length} applied`;
  return decided ? "Dismissed" : "Outdated";
}

/** Word-level highlights for one change; whole sides are marked when too large. */
export function wordDiff(before: string, after: string): { before: WordPart[]; after: WordPart[] } {
  const a = before.match(/\s+|\S+/g) ?? [];
  const b = after.match(/\s+|\S+/g) ?? [];
  if (a.length * b.length > tableLimit)
    return {
      before: before ? [{ text: before, changed: true }] : [],
      after: after ? [{ text: after, changed: true }] : [],
    };
  const pairs = align(a, b);
  const mark = (tokens: string[], kept: Set<number>) =>
    tokens.reduce<WordPart[]>((parts, text, at) => {
      // Whitespace joins its neighbours' state so highlights do not flicker.
      const changed = !kept.has(at) && /\S/.test(text);
      const last = parts.at(-1);
      if (last && (last.changed === changed || !/\S/.test(text))) last.text += text;
      else parts.push({ text, changed });
      return parts;
    }, []);
  return { before: mark(a, new Set(pairs.map(([i]) => i))), after: mark(b, new Set(pairs.map(([, j]) => j))) };
}
