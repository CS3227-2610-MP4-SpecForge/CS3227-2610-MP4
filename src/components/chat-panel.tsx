"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { describeAiFailure } from "@/ai-diagnostics";
import type { ChatTurn } from "@/chat";
import { sameFields, type RequestFields } from "@/requests";
import { api, failureMessage } from "./http";
import { Button, Notice, TextareaField } from "./ui";
import { Markdown } from "./markdown";
type SendInput = { key: string; revision: number; fields: RequestFields; message: string; retry: boolean };
export function ChatPanel({ path, fields, revision, canSend, canApply, onApply }: {
  path: string; fields: RequestFields; revision: number; canSend: boolean; canApply: boolean; onApply(turn: ChatTurn): Promise<boolean>;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replay, setReplay] = useState(false);
  const [replayInput, setReplayInput] = useState<SendInput | null>(null);
  const [unresolved, setUnresolved] = useState(false);
  const [stale, setStale] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());
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
  async function send(input: SendInput, clearMessage = false) {
    if (operation.current || !canSend || running || unresolved && pending.current?.key !== input.key) return;
    operation.current = true; setBusy(true); setError(""); setReplay(false); setReplayInput(null); setUnresolved(true); pending.current = input;
    try {
      const result = await api(path, input, 75000);
      const turn: ChatTurn = result.turn;
      setTurns(previous => [...previous.filter(item => item.id !== turn.id), turn].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)));
      pending.current = null; setUnresolved(false);
      if (clearMessage) setMessage(current => current.trim() === input.message ? "" : current);
    } catch (failure) { setError(failureMessage(failure) + " Refresh chat to reconcile before retrying this send."); }
    finally { operation.current = false; setBusy(false); }
  }
  async function apply(turn: ChatTurn) {
    if (operation.current || !canApply) return;
    operation.current = true; setBusy(true); setError("");
    try {
      if (await onApply(turn)) setApplied(previous => new Set(previous).add(turn.id));
      else setStale(previous => new Set(previous).add(turn.id));
    } catch (failure) { setError(failureMessage(failure)); }
    finally { operation.current = false; setBusy(false); }
  }
  const disabled = busy || running || loading || !canSend || unresolved;
  return <div className="card stack chat-panel" aria-label="AI chat" aria-busy={busy || running}>
    <div className="section-title"><h2>AI chat</h2><Button className="secondary" disabled={busy || loading} onClick={() => { setLoading(true); void load(); }}>Refresh chat</Button></div>
    <p className="muted">Private to you. Discuss this task, then review and apply any proposed update.</p>
    {error && <Notice danger>{error}</Notice>}
    {replay && replayInput && <Button disabled={busy || running || loading || !canSend} onClick={() => send({ ...replayInput, revision, fields: { ...fields } }, true)}>{replayInput.revision === revision && sameFields(replayInput.fields, fields) ? "Retry reconciled send" : "Send reconciled message with current task"}</Button>}
    {loading && turns.length === 0 ? <Notice>Loading chat…</Notice> : turns.length === 0 && <p className="muted">No messages yet. Describe your idea or ask a question.</p>}
    <div className="chat-transcript" aria-label="Conversation">
      {turns.map(turn => {
        const current = turn.base_revision === revision && sameFields(turn.input_fields, fields) && !stale.has(turn.id);
        return <article className="chat-turn" key={turn.id}>
          <div className="chat-bubble user-message"><strong>You</strong><p className="request-text">{turn.message}</p></div>
          {turn.reply && <div className="chat-bubble assistant-message"><strong>AI</strong><Markdown text={turn.reply} /></div>}
          {turn.status === "failed" && <div><Notice danger>{describeAiFailure(turn.error_code, turn.diagnostic)}</Notice><Button className="secondary" disabled={disabled || !current || turn.error_code === "context_limit"} onClick={() => send({ key: turn.turn_key, revision: turn.base_revision, fields: turn.input_fields, message: turn.message, retry: true })}>Retry AI turn</Button>{!current && <p className="hint">The task changed. Send a new message using the current task.</p>}</div>}
          {turn.proposal && <div className="task-proposal"><h3>Task proposal</h3><h4>{turn.proposal.title}</h4><Markdown text={turn.proposal.description} />
            <Button disabled={busy || !canApply || !current || applied.has(turn.id)} onClick={() => apply(turn)}>Apply update</Button>
            <p className="hint">{applied.has(turn.id) ? "Applied to your editor." : current ? "Not applied. Review this proposal before replacing both task fields." : "Outdated proposal. Your task is unchanged; request a fresh proposal explicitly."}</p>
          </div>}
        </article>;
      })}
    </div>
    {(busy && !turns.some(turn => turn.status === "running") || running) && <Notice>AI is responding…</Notice>}
    <form className="stack" onSubmit={event => { event.preventDefault(); if (message.trim()) void send({ key: crypto.randomUUID(), revision, fields: { ...fields }, message: message.trim(), retry: false }, true); }}>
      <TextareaField id="chat-message" label="Chat message" rows={3} maxLength={8000} value={message} disabled={busy} onChange={event => setMessage(event.target.value)} />
      {[...message].length > 4000 && <Notice danger>Chat messages are limited to 4,000 characters.</Notice>}
      <div className="actions"><Button disabled={disabled || !message.trim() || [...message].length > 4000}>Send message</Button><Button type="button" className="secondary" disabled={disabled} onClick={() => send({ key: crypto.randomUUID(), revision, fields: { ...fields }, message: "Please generate a task proposal now using my current task and our conversation. Make unresolved assumptions explicit.", retry: false })}>Request task proposal</Button></div>
      {!canSend && <p className="hint">Resolve task save/conflict errors and wait for draft autosave before sending. Manual task editing remains available.</p>}
    </form>
  </div>;
}
