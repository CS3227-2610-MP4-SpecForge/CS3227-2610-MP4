"use client";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { describeAiFailure } from "@/ai-diagnostics";
import { answerLimit, assistanceMessages, type AiAnswer } from "@/assistance";
import type { ChatTurn } from "@/chat";
import { sameFields, type RequestFields } from "@/requests";
import { reviewStatus, summarizeChanges, ticketChanges } from "@/ticket-changes";
import { tooLargeForAi, type Assistant } from "./use-assistant";
import { Button, Notice, TextareaField } from "./ui";
import { Markdown } from "./markdown";

// Choices are indexes into the model's options plus two client-only choices,
// so option text can never be mistaken for either.
const undecided = "undecided";
const own = "own";
// Gap questions and options are model output: rendered as plain text only.
// "Leave undecided" and "Your own answer" are added here, never by the model.
function GapsChecklist({
  turn,
  disabled,
  onApply,
}: {
  turn: ChatTurn;
  disabled: boolean;
  onApply(answers: AiAnswer[]): void;
}) {
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [typed, setTyped] = useState<Record<number, string>>({});
  const questions = turn.questions ?? [];
  const answers = questions.flatMap((question, index): AiAnswer[] => {
    const choice = choices[index];
    if (choice === undefined) return [];
    if (choice === undecided) return [{ question: question.prompt, answer: null }];
    if (choice === own) return typed[index]?.trim() ? [{ question: question.prompt, answer: typed[index].trim() }] : [];
    const option = question.options[Number(choice.slice("option-".length))];
    return option === undefined ? [] : [{ question: question.prompt, answer: option }];
  });
  return (
    <section className="stack gaps-checklist" aria-label="Open questions">
      <p className="muted">Answer what you can. Unanswered questions are left out.</p>
      {questions.map((question, index) => (
        <fieldset key={index} className="stack gap-question">
          <legend>{question.prompt}</legend>
          {[
            ...question.options.map((option, at) => ({ value: `option-${at}`, label: option })),
            { value: undecided, label: "Leave undecided" },
            { value: own, label: "Your own answer" },
          ].map(choice => (
            <label key={choice.value} className="gap-option">
              <input
                type="radio"
                name={`gap-${turn.id}-${index}`}
                value={choice.value}
                checked={choices[index] === choice.value}
                onChange={() => setChoices(current => ({ ...current, [index]: choice.value }))}
              />
              {choice.label}
            </label>
          ))}
          {choices[index] === own && (
            <TextareaField
              id={`gap-${turn.id}-${index}-own`}
              label="Your answer"
              rows={2}
              maxLength={answerLimit}
              value={typed[index] ?? ""}
              onChange={event => setTyped(current => ({ ...current, [index]: event.target.value }))}
            />
          )}
        </fieldset>
      ))}
      <div className="actions">
        <Button type="button" disabled={disabled || answers.length === 0} onClick={() => onApply(answers)}>
          Apply answers
        </Button>
      </div>
    </section>
  );
}

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

function UsageMeter({ assistant }: { assistant: Assistant }) {
  const usage = assistant.usage;
  if (!usage) return null;
  const reset =
    usage.resets_at && usage.remaining < 5
      ? ` More at ${new Date(usage.resets_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
      : "";
  const share = usage.limit > 0 ? Math.min(100, Math.max(0, (usage.remaining / usage.limit) * 100)) : 0;
  return (
    <div className="assistant-usage">
      <div
        className={`usage-track ${usage.remaining === 0 ? "usage-empty" : ""}`}
        role="meter"
        aria-label="AI requests left this hour"
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={usage.remaining}
      >
        <span className="usage-fill" style={{ width: `${share}%` }} />
      </div>
      <p className="hint" aria-live="polite">
        {usage.remaining}/{usage.limit} AI requests left this hour.{reset}
      </p>
    </div>
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

// Read-only questions from an earlier or superseded gaps check.
function PastQuestions({ turn }: { turn: ChatTurn }) {
  return (
    <ul className="past-questions">
      {(turn.questions ?? []).map((question, index) => (
        <li key={index}>{question.prompt}</li>
      ))}
    </ul>
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
  // Only the newest gaps check that has not been answered since can be answered.
  const lastGaps = turns.findLastIndex(turn => turn.status === "completed" && turn.questions);
  const answerable = lastGaps >= 0 && !turns.slice(lastGaps + 1).some(turn => turn.answers) ? turns[lastGaps] : null;
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
    if (!text || [...text].length > 4000) return;
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
      ...(turn.answers ? { answers: turn.answers } : typed ? { message: turn.message } : {}),
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
                <li className="hint chat-empty">
                  Ask for a change, or use Check for gaps to find what the ticket is missing.
                </li>
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
                      {turn.status === "completed" && turn.proposal && (
                        <ChangeCard
                          turn={turn}
                          fields={fields}
                          rejected={rejections[turn.id] ?? noRejections}
                          onReview={() => onReview(turn)}
                        />
                      )}
                      {turn.status === "completed" &&
                        turn.questions &&
                        (turn === answerable ? (
                          <GapsChecklist
                            key={turn.id}
                            turn={turn}
                            disabled={blocked || !isCurrent(turn)}
                            onApply={answers => {
                              following.current = true;
                              void assistant.send({
                                key: crypto.randomUUID(),
                                revision,
                                fields: { ...fields },
                                intent: "edit",
                                answers,
                                retry: false,
                              });
                            }}
                          />
                        ) : (
                          <PastQuestions turn={turn} />
                        ))}
                      {turn === answerable && !isCurrent(turn) && (
                        <p className="hint">
                          The ticket changed. Check for gaps again to answer against the current ticket.
                        </p>
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
                  <span role="status">AI is responding… You can keep editing.</span>
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
            <UsageMeter assistant={assistant} />
            <form className="stack" onSubmit={ask}>
              <TextareaField
                id="chat-message"
                label="Ask AI to change or explain this ticket"
                rows={3}
                maxLength={8000}
                placeholder="Make this shorter, or explain the edge cases…"
                value={message}
                disabled={busy}
                onChange={event => setMessage(event.target.value)}
              />
              {[...message].length > 4000 && <Notice danger>AI requests are limited to 4,000 characters.</Notice>}
              <div className="actions">
                <Button disabled={blocked || !message.trim() || [...message].length > 4000}>Ask AI</Button>
                <Button
                  type="button"
                  className="secondary"
                  disabled={blocked || !fields.description.trim()}
                  onClick={() => {
                    following.current = true;
                    void assistant.send({
                      key: crypto.randomUUID(),
                      revision,
                      fields: { ...fields },
                      intent: "gaps",
                      retry: false,
                    });
                  }}
                >
                  Check for gaps
                </Button>
              </div>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
