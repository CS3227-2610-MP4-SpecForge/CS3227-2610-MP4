"use client";
import { useState, type ReactNode } from "react";
import { describeAiFailure } from "@/ai-diagnostics";
import { answerLimit, type AiAnswer } from "@/assistance";
import type { ChatTurn } from "@/chat";
import { sameFields, type RequestFields } from "@/requests";
import { tooLargeForAi, type Assistant } from "./use-assistant";
import { Button, Notice, TextareaField } from "./ui";
import { Markdown } from "./markdown";

// Choices are indexes into the model's options plus two client-only choices,
// so option text can never be mistaken for either.
const undecided = "undecided";
const own = "own";
// Gap questions and options are model output: rendered as plain text only.
// "Leave undecided" and "Your own answer" are added here, never by the model.
function GapsChecklist({ turn, disabled, onApply }: { turn: ChatTurn; disabled: boolean; onApply(answers: AiAnswer[]): void }) {
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
  return <section className="stack gaps-checklist" aria-label="Open questions">
    <p className="muted">Answer what you can. Unanswered questions are left out.</p>
    {questions.map((question, index) => <fieldset key={index} className="stack gap-question">
      <legend>{question.prompt}</legend>
      {[...question.options.map((option, at) => ({ value: `option-${at}`, label: option })), { value: undecided, label: "Leave undecided" }, { value: own, label: "Your own answer" }].map(choice => <label key={choice.value} className="gap-option">
        <input type="radio" name={`gap-${turn.id}-${index}`} value={choice.value} checked={choices[index] === choice.value} onChange={() => setChoices(current => ({ ...current, [index]: choice.value }))} />
        {choice.label}
      </label>)}
      {choices[index] === own && <TextareaField id={`gap-${turn.id}-${index}-own`} label="Your answer" rows={2} maxLength={answerLimit} value={typed[index] ?? ""} onChange={event => setTyped(current => ({ ...current, [index]: event.target.value }))} />}
    </fieldset>)}
    <div className="actions"><Button type="button" disabled={disabled || answers.length === 0} onClick={() => onApply(answers)}>Apply answers</Button></div>
  </section>;
}

function FailureNotice({ turn, current, disabled, onRetry }: { turn: ChatTurn; current: boolean; disabled: boolean; onRetry(): void }) {
  const tooLong = turn.error_code === "context_limit";
  return <div className="stack assistant-failure">
    <Notice danger>{tooLong ? "This ticket is too long for AI. Your ticket is unchanged, and this did not use one of your hourly AI requests." : "AI couldn't complete this request. Your ticket is unchanged, and this did not use one of your hourly AI requests."}</Notice>
    <details className="assistant-details"><summary>Details</summary><p className="hint">{describeAiFailure(turn.error_code, turn.diagnostic)}</p></details>
    {!tooLong && <div className="actions"><Button type="button" className="secondary" disabled={disabled || !current} onClick={onRetry}>Try again</Button></div>}
    {!tooLong && !current && <p className="hint">The ticket changed. Send a new request using the current ticket.</p>}
  </div>;
}

function UsageMeter({ assistant }: { assistant: Assistant }) {
  const usage = assistant.usage;
  if (!usage) return null;
  const reset = usage.resets_at && usage.remaining < 5 ? ` More at ${new Date(usage.resets_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : "";
  return <p className="hint assistant-usage" aria-live="polite">{usage.remaining} of {usage.limit} AI requests left this hour.{reset}</p>;
}

export function ChatPanel({ assistant, fields, revision, canSend, reviewing, onReview, children, header, review }: {
  assistant: Assistant; fields: RequestFields; revision: number; canSend: boolean; reviewing: boolean;
  onReview(turn: ChatTurn): void; children: ReactNode; header: ReactNode; review: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const { turns, latest, error, replay, disabled, busy, running, loading, message, setMessage } = assistant;
  const earlier = turns.filter(turn => turn !== latest).reverse();
  const tooLarge = tooLargeForAi(fields, message);
  const blocked = disabled || tooLarge;
  const isCurrent = (turn: ChatTurn) => turn.base_revision === revision && sameFields(turn.input_fields, fields);
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || [...text].length > 4000) return;
    await assistant.send({ key: crypto.randomUUID(), revision, fields: { ...fields }, intent: "edit", message: text, retry: false });
  }
  function retry(turn: ChatTurn) {
    void assistant.send({ key: turn.turn_key, revision: turn.base_revision, fields: turn.input_fields, intent: turn.intent, ...(turn.answers ? { answers: turn.answers } : turn.intent === "edit" ? { message: turn.message } : {}), retry: true });
  }
  function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (error && !replay) void assistant.sync();
    window.requestAnimationFrame(() => document.getElementById("chat-message")?.focus());
  }
  return <div className="stack ticket-assistance">
    <div className="ticket-topbar">
      {header}
      <Button type="button" className="secondary ai-toggle" aria-expanded={open} aria-controls="ticket-discussion" onClick={toggle}>{open ? "Hide AI assistant" : "Show AI assistant"}</Button>
    </div>
    <div className={`ticket-workspace ${open ? "discussion-open" : ""}`}>
      <div className="task-panel stack">{children}</div>
      <aside id="ticket-discussion" className="card stack chat-panel" aria-label="AI assistant" hidden={!open} aria-busy={busy || running}>
        <h2>AI assistant</h2>
        <p className="hint">Private to you. Suggestions change your ticket only when you accept them.</p>
        <UsageMeter assistant={assistant} />
        {(busy || running) && <span role="status">AI is responding… You can keep editing.</span>}
        {!canSend && <span className="hint">Wait for autosave or resolve save errors before asking AI.</span>}
        {tooLarge && <Notice>This ticket is too long for AI. Shorten it or keep editing manually.</Notice>}
        {error && <Notice danger>{error}</Notice>}
        {replay && <Button disabled={!assistant.canReplay || tooLarge} onClick={() => { void assistant.send({ ...replay, revision, fields: { ...fields } }); }}>Send again</Button>}
        {review}
        {loading && turns.length === 0 && <Notice>Loading AI assistant…</Notice>}
        {latest && <section className="stack assistant-latest" aria-label="Latest result">
          <div className="chat-bubble user-message"><strong>You</strong><p className="request-text">{latest.message}</p></div>
          {latest.reply && <div className="chat-bubble assistant-message"><strong>AI</strong><Markdown text={latest.reply} /></div>}
          {latest.proposal && !reviewing && <div><Button type="button" className="secondary" disabled={busy} onClick={() => onReview(latest)}>Review ticket changes</Button>{!isCurrent(latest) && <p className="hint">This suggestion is outdated. Your ticket is unchanged.</p>}</div>}
          {latest.status === "failed" && <FailureNotice key={latest.id} turn={latest} current={isCurrent(latest)} disabled={blocked} onRetry={() => retry(latest)} />}
          {latest.status === "completed" && latest.questions && <GapsChecklist key={latest.id} turn={latest} disabled={blocked || !isCurrent(latest)}
            onApply={answers => { void assistant.send({ key: crypto.randomUUID(), revision, fields: { ...fields }, intent: "edit", answers, retry: false }); }} />}
          {latest.status === "completed" && latest.questions && !isCurrent(latest) && <p className="hint">The ticket changed. Check for gaps again to answer against the current ticket.</p>}
        </section>}
        <form className="stack" onSubmit={ask}>
          <TextareaField id="chat-message" label="Ask AI to change or explain this ticket" rows={3} maxLength={8000} placeholder="Make this shorter, or explain the edge cases…" value={message} disabled={busy} onChange={event => setMessage(event.target.value)} />
          {[...message].length > 4000 && <Notice danger>AI requests are limited to 4,000 characters.</Notice>}
          <div className="actions">
            <Button disabled={blocked || !message.trim() || [...message].length > 4000}>Ask AI</Button>
            <Button type="button" className="secondary" disabled={blocked || !fields.description.trim()} onClick={() => { void assistant.send({ key: crypto.randomUUID(), revision, fields: { ...fields }, intent: "gaps", retry: false }); }}>Check for gaps</Button>
          </div>
        </form>
        {earlier.length > 0 && <details className="assistant-history">
          <summary>Earlier requests ({earlier.length})</summary>
          <ol className="chat-transcript stack" aria-label="Earlier requests">
            {earlier.map(turn => <li className="chat-turn" key={turn.id}>
              <div className="chat-bubble user-message"><strong>You</strong><p className="request-text">{turn.message}</p></div>
              {turn.reply && <div className="chat-bubble assistant-message"><strong>AI</strong><Markdown text={turn.reply} /></div>}
              {turn.status === "failed" && <p className="hint">This request failed and did not use one of your hourly AI requests.</p>}
              {turn.proposal && <div><Button type="button" className="secondary" disabled={busy} onClick={() => onReview(turn)}>Review ticket changes</Button>{!isCurrent(turn) && <p className="hint">This suggestion is outdated. Your ticket is unchanged.</p>}</div>}
            </li>)}
          </ol>
        </details>}
      </aside>
    </div>
  </div>;
}
