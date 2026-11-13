"use client";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { describeAiFailure } from "@/ai-diagnostics";
import { assistanceMessages, messageLimit } from "@/assistance";
import type { ChatTurn } from "@/chat";
import { sameFields, type RequestFields } from "@/requests";
import { reviewStatus, summarizeChanges, ticketChanges } from "@/ticket-changes";
import { tooLargeForAi, type Assistant } from "./use-assistant";
import { Button, Notice, TextareaField } from "./ui";
import { UsageMeter } from "./usage-meter";
import { Markdown } from "./markdown";

function FailureNotice({
  turn,
  current,
  disabled,
  onRetry,
}: {
  turn: ChatTurn;
  current: boolean;
  disabled: boolean;
  onRetry(): void;
}) {
  const tooLong = turn.error_code === "context_limit";
  return (
    <div className="stack assistant-failure">
      <Notice danger>
        {tooLong
          ? "This ticket is too long for AI. Your ticket is unchanged, and this did not use one of your hourly AI requests."
          : "AI couldn't complete this request. Your ticket is unchanged, and this did not use one of your hourly AI requests."}
      </Notice>
      <details className="assistant-details">
        <summary>Details</summary>
        <p className="hint">{describeAiFailure(turn.error_code, turn.diagnostic)}</p>
      </details>
      {!tooLong && (
        <div className="actions">
          <Button type="button" className="secondary" disabled={disabled || !current} onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
      {!tooLong && !current && <p className="hint">The ticket changed. Send a new request using the current ticket.</p>}
    </div>
  );
}

function AssistantUsage({ assistant }: { assistant: Assistant }) {
  const usage = assistant.usage;
  if (!usage) return null;
  const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const reset = usage.resets_at && usage.remaining < 5 ? ` More at ${time(usage.resets_at)}.` : "";
  return (
    <UsageMeter remaining={usage.remaining} limit={usage.limit} label="AI requests left this hour">
      {usage.remaining}/{usage.limit} AI requests left this hour.{reset}
      {usage.daily && ` ${usage.daily.remaining} of ${usage.daily.limit} left today.`}
    </UsageMeter>
  );
}

function ChangeCard({
  turn,
  fields,
  rejected,
  onReview,
}: {
  turn: ChatTurn;
  fields: RequestFields;
  rejected: ReadonlySet<string>;
  onReview(): void;
}) {
  const changes = useMemo(
    () => (turn.proposal ? ticketChanges(turn.input_fields, turn.proposal) : []),
    [turn.input_fields, turn.proposal],
  );
  if (changes.length === 0) return <p className="hint">No ticket changes suggested.</p>;
  return (
    <div className="change-card">
      <div>
        <strong>{summarizeChanges(changes)}</strong>
        <span className="change-card-status">{reviewStatus(changes, fields, rejected)}</span>
      </div>
      <Button type="button" id={`review-${turn.id}`} className="secondary" aria-haspopup="dialog" onClick={onReview}>
        Review changes
      </Button>
    </div>
  );
}

const noRejections: ReadonlySet<string> = new Set();

export function ChatPanel({
  assistant,
  fields,
  revision,
  canSend,
  rejections,
  onReview,
  children,
  header,
  footer,
}: {
  assistant: Assistant;
  fields: RequestFields;
  revision: number;
  canSend: boolean;
  rejections: Record<string, ReadonlySet<string>>;
  onReview(turn: ChatTurn): void;
  children: ReactNode;
  header: ReactNode;
  footer: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const { turns, latest, error, replay, disabled, busy, running, loading, message, setMessage } = assistant;
  const tooLarge = tooLargeForAi(fields, message);
  const blocked = disabled || tooLarge;
  const isCurrent = (turn: ChatTurn) => turn.base_revision === revision && sameFields(turn.input_fields, fields);
  const transcript = useRef<HTMLOListElement>(null);
  const following = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const newest = `${turns.at(-1)?.id}:${turns.at(-1)?.status}:${busy}`;
  const [seen, setSeen] = useState(newest);
  // Follow new replies only while the reader is at the bottom of the transcript.
  useLayoutEffect(() => {
    const list = transcript.current;
    if (list && following.current) list.scrollTop = list.scrollHeight;
  }, [newest, open]);
  function scrolled() {
    const list = transcript.current!;
    const bottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
    // Replies that arrived while following were seen, even without a scroll event.
    if (bottom || following.current) setSeen(newest);
    following.current = bottom;
    setAtBottom(bottom);
  }
  function jumpToNewest() {
    const list = transcript.current!;
    following.current = true;
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || [...text].length > messageLimit) return;
    // On an empty ticket the instruction is a rough idea, so it drafts the ticket.
    const empty = !fields.title.trim() && !fields.description.trim();
    following.current = true;
    await assistant.send({
      key: crypto.randomUUID(),
      revision,
      fields: { ...fields },
      intent: empty ? "draft" : "edit",
      message: text,
      retry: false,
    });
  }
  function retry(turn: ChatTurn) {
    // Retries resend exactly what was stored; fixed server messages are not resent.
    const typed = turn.intent === "edit" || (turn.intent === "draft" && turn.message !== assistanceMessages.draft);
    void assistant.send({
      key: turn.turn_key,
      revision: turn.base_revision,
      fields: turn.input_fields,
      intent: turn.intent,
      ...(typed ? { message: turn.message } : {}),
      retry: true,
    });
  }
  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (error && !replay) void assistant.sync();
    window.requestAnimationFrame(() => document.getElementById("chat-message")?.focus());
  }
  return (
    <div className="stack ticket-assistance">
      <div className="ticket-topbar">
        {header}
        <Button
          type="button"
          className="secondary ai-toggle"
          aria-expanded={open}
          aria-controls="ticket-discussion"
          onClick={toggle}
        >
          {open ? "Hide AI assistant" : "Show AI assistant"}
        </Button>
      </div>
      <div className={`ticket-workspace ${open ? "discussion-open" : ""}`}>
        <div className="task-panel stack">{children}</div>
        <aside
          id="ticket-discussion"
          className="card chat-panel"
          aria-label="AI assistant"
          hidden={!open}
          aria-busy={busy || running}
        >
          <div className="chat-panel-header">
            <h2>AI assistant</h2>
            <p className="hint">Private to you. Suggestions change your ticket only when you accept them.</p>
          </div>
          <div className="chat-transcript-frame">
            <ol ref={transcript} className="chat-transcript" aria-label="Conversation" onScroll={scrolled} tabIndex={0}>
              {loading && turns.length === 0 && (
                <li>
                  <Notice>Loading AI assistant…</Notice>
                </li>
              )}
              {!loading && turns.length === 0 && (
                <li className="hint chat-empty">Ask for a change, or ask what the ticket is missing.</li>
              )}
              {turns.map(turn => (
                <li className="chat-turn" key={turn.id}>
                  <div className="chat-bubble user-message">
                    <strong>You</strong>
                    <p className="request-text">{turn.message}</p>
                  </div>
                  {turn.status !== "running" && (
                    <div className="chat-bubble assistant-message">
                      <strong>AI</strong>
                      {turn.reply && <Markdown text={turn.reply} />}
                      {/* A reply can claim a change it never made, so say plainly when there is none. */}
                      {turn.status === "completed" && !turn.proposal && (
                        <p className="hint">No ticket changes suggested.</p>
                      )}
                      {turn.status === "completed" && turn.proposal && (
                        <ChangeCard
                          turn={turn}
                          fields={fields}
                          rejected={rejections[turn.id] ?? noRejections}
                          onReview={() => onReview(turn)}
                        />
                      )}
                      {turn.status === "failed" &&
                        (turn === latest ? (
                          <FailureNotice
                            key={turn.id}
                            turn={turn}
                            current={isCurrent(turn)}
                            disabled={blocked}
                            onRetry={() => retry(turn)}
                          />
                        ) : (
                          <p className="hint">This request failed and did not use one of your hourly AI requests.</p>
                        ))}
                    </div>
                  )}
                </li>
              ))}
              {(busy || running) && (
                <li className="chat-bubble assistant-message chat-pending">
                  <strong>AI</strong>
                  <span role="status">AI is responding…</span>
                </li>
              )}
            </ol>
            {!atBottom && seen !== newest && (
              <Button type="button" className="secondary new-reply" onClick={jumpToNewest}>
                New reply ↓
              </Button>
            )}
          </div>
          <div className="stack chat-panel-footer">
            {footer}
            {!canSend && <span className="hint">Wait for autosave or resolve save errors before asking AI.</span>}
            {tooLarge && <Notice>This ticket is too long for AI. Shorten it or keep editing manually.</Notice>}
            {assistant.limitNotice && <Notice>{assistant.limitNotice}</Notice>}
            {error && <Notice danger>{error}</Notice>}
            {replay && (
              <Button
                disabled={!assistant.canReplay || tooLarge}
                onClick={() => {
                  void assistant.send({ ...replay, revision, fields: { ...fields } });
                }}
              >
                Send again
              </Button>
            )}
            <AssistantUsage assistant={assistant} />
            <form className="stack" onSubmit={ask}>
              <TextareaField
                id="chat-message"
                label="Ask AI to change or explain this ticket"
                rows={3}
                limit={messageLimit}
                maxLength={8000}
                placeholder="Make this shorter, or explain the edge cases…"
                value={message}
                disabled={busy}
                onChange={event => setMessage(event.target.value)}
              />
              {[...message].length > messageLimit && (
                <Notice danger>AI requests are limited to 4,000 characters.</Notice>
              )}
              <div className="actions">
                <Button disabled={blocked || !message.trim() || [...message].length > messageLimit}>Ask AI</Button>
              </div>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
