import type { ChatTurn } from "@/chat";
import { sameFields, type RequestFields } from "@/requests";
import { Button, Notice } from "./ui";

function ChangedText({ before, after }: { before: string; after: string }) {
  const oldLines = before.split("\n"); const newLines = after.split("\n");
  let first = 0; let last = 0;
  while (first < oldLines.length && first < newLines.length && oldLines[first] === newLines[first]) first++;
  while (last < oldLines.length - first && last < newLines.length - first && oldLines[oldLines.length - last - 1] === newLines[newLines.length - last - 1]) last++;
  const removed = oldLines.slice(first, oldLines.length - last).join("\n");
  const added = newLines.slice(first, newLines.length - last).join("\n");
  return <div className="suggestion-diff">
    {removed && <div><strong>Remove</strong><pre><del>{removed}</del></pre></div>}
    {added && <div><strong>Add</strong><pre><ins>{added}</ins></pre></div>}
  </div>;
}
export function SuggestionReview({ turn, fields, revision, disabled, onAccept, onDiscard }: {
  turn: ChatTurn; fields: RequestFields; revision: number; disabled: boolean; onAccept(): void; onDiscard(): void;
}) {
  if (!turn.proposal) return null;
  const current = revision === turn.base_revision && sameFields(fields, turn.input_fields);
  const changed = !sameFields(turn.input_fields, turn.proposal);
  return <section className="suggestion-review stack" role="region" aria-label="Suggested ticket changes" tabIndex={-1} id="ticket-suggestion">
    <div><p className="eyebrow">AI suggestion</p><h2>Review ticket changes</h2><p className="muted">Your ticket stays unchanged until you accept.</p></div>
    {turn.proposal.title !== turn.input_fields.title && <div><h3>Title</h3><ChangedText before={turn.input_fields.title} after={turn.proposal.title} /></div>}
    {turn.proposal.description !== turn.input_fields.description && <div><h3>Description</h3><ChangedText before={turn.input_fields.description} after={turn.proposal.description} /></div>}
    {!changed && <Notice>The AI suggested no changes.</Notice>}
    {!current && <Notice danger>Your ticket changed. Discard this suggestion and ask for a fresh one.</Notice>}
    <div className="actions"><Button type="button" disabled={disabled || !current || !changed} onClick={onAccept}>Accept changes</Button><Button type="button" className="secondary" onClick={onDiscard}>Discard</Button></div>
  </section>;
}
