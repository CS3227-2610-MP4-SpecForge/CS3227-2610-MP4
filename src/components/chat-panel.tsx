"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { describeAiFailure } from "@/ai-diagnostics";
import { assistanceMessages } from "@/assistance";
import type { ChatTurn } from "@/chat";
import { sameFields, type RequestFields } from "@/requests";
import { api, failureMessage } from "./http";
import { Button, Notice, TextareaField } from "./ui";
import { Markdown } from "./markdown";
type SendInput = { key: string; revision: number; fields: RequestFields; message: string; retry: boolean };
export function ChatPanel({ path, fields, revision, canSend, starting, onManual, onRoughIdea, onSuggestion, children, header, review }: {
  path: string; fields: RequestFields; revision: number; canSend: boolean; starting: boolean;
  onManual(): void; onRoughIdea(value: string): void; onSuggestion(turn: ChatTurn, firstDraft: boolean): Promise<void>; children: ReactNode; header: ReactNode; review: ReactNode;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replay, setReplay] = useState(false);
  const [replayInput, setReplayInput] = useState<SendInput | null>(null);
  const [unresolved, setUnresolved] = useState(false);
  const operation = useRef(false);
  const pending = useRef<SendInput | null>(null);
  const load = useCallback(async () => {
    try {
      const result = await api(path);
      setTurns(result.turns); setError("");
      if (pending.current) {
        const known = result.turns.find((turn: ChatTurn) => turn.turn_key === pending.current!.key);
        if (known) { const sentMessage = pending.current.message; pending.current = null; setReplay(false); setReplayInput(null); setUnresolved(false); setMessage(current => current.trim() === sentMessage ? "" : current); }
        else { setReplay(true); setReplayInput({ ...pending.current }); }
      }
    } catch (failure) { setError(failureMessage(failure)); }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) return load(); }); return () => { active = false; }; }, [load]);
  useEffect(() => {
    if (!turns.some(turn => turn.status === "running")) return;
    const timer = window.setTimeout(() => { void load(); }, 2000);
    return () => window.clearTimeout(timer);
  }, [turns, load]);
  const running = turns.some(turn => turn.status === "running");
  async function send(input: SendInput, clearMessage = false, firstDraft = false) {
    if (operation.current || !canSend || running || unresolved && pending.current?.key !== input.key) return;
    operation.current = true; setBusy(true); setError(""); setReplay(false); setReplayInput(null); setUnresolved(true); pending.current = input;
    try {
      const result = await api(path, input, 75000);
      const turn: ChatTurn = result.turn;
      setTurns(previous => [...previous.filter(item => item.id !== turn.id), turn].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)));
      pending.current = null; setUnresolved(false);
      if (clearMessage) setMessage(current => current.trim() === input.message ? "" : current);
      setOpen(true);
      if (turn.proposal) await onSuggestion(turn, firstDraft);
    } catch (failure) { setError(failureMessage(failure) + " Refresh chat to reconcile before retrying this send."); setOpen(true); }
    finally { operation.current = false; setBusy(false); }
  }
  const disabled = busy || running || loading || !canSend || unresolved;
  function ask(instruction: string, firstDraft = false) { void send({ key: crypto.randomUUID(), revision, fields: { ...fields }, message: instruction, retry: false }, false, firstDraft); }
  function focusDiscussion() { setOpen(true); window.requestAnimationFrame(() => document.getElementById("chat-message")?.focus()); }
  return <div className="stack ticket-assistance">
    <div className="ticket-topbar">
      {header}
      <Button type="button" className="secondary ai-toggle" aria-expanded={open} aria-controls="ticket-discussion" onClick={() => { if (open) setOpen(false); else focusDiscussion(); }}>{open ? "Hide AI assistant" : "Show AI assistant"}</Button>
    </div>
    <div className={`ticket-workspace ${open ? "discussion-open" : ""}`}>
      <div className="task-panel stack">{children}</div>
      <aside id="ticket-discussion" className="card stack chat-panel" aria-label="AI discussion" hidden={!open} aria-busy={busy || running}>
        <div className="section-title"><h2>Discuss this ticket</h2><Button className="secondary" disabled={busy || loading} onClick={() => { setLoading(true); void load(); }}>Refresh chat</Button></div>
        <p className="hint">Private to you. Ask questions or describe a change. Review suggestions here before applying them to your ticket.</p>
    {starting && <section className="stack idea-starter" aria-label="Start a ticket">
      <div><p className="eyebrow">Start with a rough idea</p><h2>What needs to change?</h2><p className="muted">A sentence is enough to get started. AI will draft a ticket you can edit.</p></div>
      <TextareaField id="rough-idea" label="What needs to change?" rows={5} maxLength={48000} placeholder="Users lose their filters when they return to the requests page…" value={fields.description} onChange={event => onRoughIdea(event.target.value)} />
      <div className="actions"><Button disabled={disabled || !fields.description.trim()} onClick={() => ask(assistanceMessages.draft, true)}>Draft ticket</Button><Button className="secondary" onClick={onManual}>Start manually</Button></div>
      <p className="hint">Your rough idea is saved privately. You can keep writing if AI is unavailable.</p>
    </section>}
    {!starting && <div className="actions assistance-toolbar" role="group" aria-label="AI writing tools">
      <Button className="secondary" disabled={disabled || !fields.title.trim() || !fields.description.trim()} onClick={() => ask(assistanceMessages.clarity)}>Improve clarity</Button>
      <Button className="secondary" disabled={disabled || !fields.title.trim() || !fields.description.trim()} onClick={() => ask(assistanceMessages.acceptance)}>Add acceptance criteria</Button>
      <Button className="secondary" disabled={disabled || !fields.description.trim()} onClick={() => { focusDiscussion(); ask(assistanceMessages.gaps); }}>Find missing details</Button>
    </div>}
        {(busy || running) && <span role="status">AI is responding… You can keep editing.</span>}
        {!canSend && <span className="hint">Wait for autosave or resolve save errors before asking AI.</span>}
        {review}
        {error && <Notice danger>{error}</Notice>}
        {replay && replayInput && <Button disabled={busy || running || loading || !canSend} onClick={() => send({ ...replayInput, revision, fields: { ...fields } }, true)}>{replayInput.revision === revision && sameFields(replayInput.fields, fields) ? "Retry reconciled send" : "Send reconciled message with current task"}</Button>}
        {loading && turns.length === 0 ? <Notice>Loading chat…</Notice> : turns.length === 0 && <p className="muted">Ask a question or tell AI how to improve your ticket.</p>}
        <div className="chat-transcript" aria-label="Conversation">
          {turns.map(turn => {
            const current = turn.base_revision === revision && sameFields(turn.input_fields, fields);
            return <article className="chat-turn" key={turn.id}>
              <div className="chat-bubble user-message"><strong>You</strong><p className="request-text">{turn.message}</p></div>
              {turn.reply && <div className="chat-bubble assistant-message"><strong>AI</strong><Markdown text={turn.reply} /></div>}
              {turn.status === "failed" && <div><Notice danger>{describeAiFailure(turn.error_code, turn.diagnostic)}</Notice><Button className="secondary" disabled={disabled || !current || turn.error_code === "context_limit"} onClick={() => send({ key: turn.turn_key, revision: turn.base_revision, fields: turn.input_fields, message: turn.message, retry: true })}>Retry AI turn</Button>{!current && <p className="hint">The ticket changed. Send a new message using the current ticket.</p>}</div>}
              {turn.proposal && <div><Button className="secondary" disabled={busy} onClick={() => { void onSuggestion(turn, false); }}>Review ticket changes</Button>{!current && <p className="hint">This suggestion is outdated. Your ticket is unchanged.</p>}</div>}
            </article>;
          })}
        </div>
        <form className="stack" onSubmit={event => { event.preventDefault(); if (message.trim() && [...message.trim()].length <= 4000) void send({ key: crypto.randomUUID(), revision, fields: { ...fields }, message: message.trim(), retry: false }, true); }}>
          <TextareaField id="chat-message" label="AI instruction or question" rows={3} maxLength={8000} placeholder="Make this shorter, or help me think through the edge cases…" value={message} disabled={busy} onChange={event => setMessage(event.target.value)} />
          {[...message].length > 4000 && <Notice danger>Chat messages are limited to 4,000 characters.</Notice>}
          <div className="actions"><Button disabled={disabled || !message.trim() || [...message].length > 4000}>Ask AI</Button>{turns.at(-1)?.status === "completed" && turns.at(-1)?.reply && !turns.at(-1)?.proposal && <Button type="button" className="secondary" disabled={disabled} onClick={() => ask(assistanceMessages.undecided)}>Leave undecided</Button>}</div>
        </form>
      </aside>
    </div>
  </div>;
}
