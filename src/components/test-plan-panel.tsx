"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { aiBrowserTimeoutMs, describeAiFailure } from "@/ai-diagnostics";
import { sameFields, type RequestFields } from "@/requests";
import {
  countKinds,
  testCaseKindLabels,
  testPlanLimits,
  type SavedTestPlan,
  type TestPlan,
  type TestPlanTurn,
} from "@/test-plans";
import { api, ApiWaitTimeout, failureMessage } from "./http";
import { Button, Notice, Pill, TextareaField, type PillTone, useNotificationState } from "./ui";

const tones: Record<string, PillTone> = { happy: "green", edge: "yellow", failure: "red" };

// Model output is untrusted: every field is rendered as plain text, never as
// Markdown or HTML, so a generated case cannot inject formatting or links.
function PlanCases({ plan }: { plan: TestPlan }) {
  return (
    <ol className="test-plan-cases">
      {plan.cases.map((item, index) => (
        <li key={index} className="test-plan-case stack">
          <div className="test-plan-case-header">
            <h4>{item.title}</h4>
            <Pill tone={tones[item.kind]}>{testCaseKindLabels[item.kind]}</Pill>
          </div>
          {item.preconditions && (
            <p className="muted">
              <strong>Preconditions: </strong>
              {item.preconditions}
            </p>
          )}
          <ol className="test-plan-steps">
            {item.steps.map((step, position) => (
              <li key={position} className="request-text">
                {step}
              </li>
            ))}
          </ol>
          <p className="request-text">
            <strong>Expected: </strong>
            {item.expected}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function TestPlanPanel({
  path,
  fields,
  ticketRevision,
  canGenerate,
}: {
  path: string;
  fields: RequestFields;
  ticketRevision: number;
  canGenerate: boolean;
}) {
  const [saved, setSaved] = useState<SavedTestPlan | null>(null);
  const [turns, setTurns] = useState<TestPlanTurn[]>([]);
  const [focus, setFocus] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [, setError] = useNotificationState(true);
  const [, setMessage] = useNotificationState(false);
  const [discarded, setDiscarded] = useState<string[]>([]);
  // A failed read stays on screen with its retry, so the panel never claims
  // "no test plan" when it could not find out.
  const [loadError, setLoadError] = useState("");
  const operation = useRef(false);

  const read = useCallback(async () => {
    if (operation.current) return;
    operation.current = true;
    setLoading(true);
    try {
      const result: { saved: SavedTestPlan | null; turns: TestPlanTurn[] } = await api(path);
      setSaved(result.saved);
      setTurns(result.turns);
      setLoadError("");
    } catch (failure) {
      setLoadError(failureMessage(failure));
    } finally {
      operation.current = false;
      setLoading(false);
    }
  }, [path]);
  // Defer the first read out of the effect body, as the chat panel does, so the
  // initial load does not set state synchronously during the effect.
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return read();
    });
    return () => {
      active = false;
    };
  }, [read]);
  useEffect(() => {
    if (!turns.some(turn => turn.status === "running")) return;
    const timer = window.setTimeout(() => {
      void read();
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [turns, read]);

  const running = turns.some(turn => turn.status === "running");
  const latest = turns.filter(turn => turn.plan && !discarded.includes(turn.id)).at(-1) ?? null;
  const proposalCurrent =
    latest !== null && latest.base_revision === ticketRevision && sameFields(latest.input_fields, fields);
  const disabled = busy || running || loading || !canGenerate;

  async function generate(retry?: TestPlanTurn) {
    if (operation.current || !canGenerate || running) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setOpen(true);
    const input = retry
      ? {
          key: retry.turn_key,
          revision: retry.base_revision,
          fields: retry.input_fields,
          focus: retry.focus,
          retry: true,
        }
      : {
          key: crypto.randomUUID(),
          revision: ticketRevision,
          fields: { ...fields },
          focus: focus.trim() || null,
          retry: false,
        };
    try {
      const result: { turn: TestPlanTurn } = await api(path, input, aiBrowserTimeoutMs);
      setTurns(previous =>
        [...previous.filter(item => item.id !== result.turn.id), result.turn].sort(
          (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
        ),
      );
      setDiscarded(previous => previous.filter(id => id !== result.turn.id));
    } catch (failure) {
      const detail =
        failure instanceof ApiWaitTimeout
          ? `The browser stopped waiting for AI after ${failure.timeoutMs / 1000} seconds.`
          : failureMessage(failure);
      setError(detail);
      await read();
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  async function save(plan: TestPlan) {
    if (operation.current || !canGenerate) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result: { saved: SavedTestPlan } = await api(
        path,
        { plan, ticketRevision, planRevision: saved?.revision ?? null },
        30000,
        "PUT",
      );
      setSaved(result.saved);
      setMessage("Test plan saved to the ticket. Everyone in this organisation can see it.");
      if (latest) setDiscarded(previous => [...previous, latest.id]);
    } catch (failure) {
      setError(failureMessage(failure));
      await read();
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="card stack test-plan" aria-label="Test plan">
      <div className="ticket-topbar">
        <div>
          <h2>Test plan</h2>
          <p className="hint">
            {canGenerate
              ? "Generate test cases from this ticket, review them, then save them for the team."
              : "Test cases saved by a developer on this team. Developers generate and save them."}
          </p>
        </div>
        <Button
          type="button"
          className="secondary"
          aria-expanded={open}
          aria-controls="test-plan-body"
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide test plan" : "Show test plan"}
        </Button>
      </div>
      <div id="test-plan-body" className="stack" hidden={!open}>
        {loading && !saved && turns.length === 0 && <Notice>Loading test plan…</Notice>}
        {loadError && !loading && (
          <div className="stack">
            <Notice danger>{loadError}</Notice>
            <Button type="button" className="secondary" onClick={() => void read()}>
              Retry loading test plan
            </Button>
          </div>
        )}

        {(busy || running) && <span role="status">AI is drafting test cases… You can keep reading the ticket.</span>}

        {saved && (
          <section className="stack" aria-label="Saved test plan">
            <div className="test-plan-meta">
              <h3>Saved plan</h3>
              <p className="muted">
                Saved by {saved.saved_by_username} on{" "}
                <time dateTime={saved.updated_at}>{new Date(saved.updated_at).toLocaleString()}</time>
                {saved.revision > 1 && ` · version ${saved.revision}`}
              </p>
              {saved.ticket_revision !== ticketRevision && (
                <Notice danger>
                  The ticket changed after this plan was saved. Generate a fresh plan before relying on it.
                </Notice>
              )}
            </div>
            <PlanCases plan={saved.plan} />
          </section>
        )}

        {latest?.plan && (
          <section className="stack suggestion-review" aria-label="Suggested test cases" id="test-plan-suggestion">
            <div>
              <p className="eyebrow">AI suggestion</p>
              <h3>
                Review {latest.plan.cases.length} suggested case{latest.plan.cases.length === 1 ? "" : "s"}
              </h3>
              <p className="muted">
                Nothing is saved to the ticket until you save it.
                {countKinds(latest.plan)
                  .map(entry => ` ${entry.count} ${testCaseKindLabels[entry.kind].toLowerCase()}.`)
                  .join("")}
              </p>
            </div>
            {latest.reply && <p className="request-text">{latest.reply}</p>}
            {latest.focus && (
              <p className="muted">
                <strong>Focus: </strong>
                {latest.focus}
              </p>
            )}
            <PlanCases plan={latest.plan} />
            {!proposalCurrent && (
              <Notice danger>
                The ticket changed after these cases were generated. Discard them and generate a fresh plan.
              </Notice>
            )}
            {canGenerate && (
              <div className="actions">
                <Button
                  type="button"
                  disabled={busy || running || !proposalCurrent}
                  onClick={() => {
                    void save(latest.plan!);
                  }}
                >
                  {saved ? "Replace saved plan" : "Save to ticket"}
                </Button>
                <Button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setDiscarded(previous => [...previous, latest.id])}
                >
                  Discard
                </Button>
              </div>
            )}
          </section>
        )}

        {turns
          .filter(turn => turn.status === "failed")
          .slice(-1)
          .map(turn => (
            <div key={turn.id} className="stack">
              <Notice danger>{describeAiFailure(turn.error_code, turn.diagnostic)}</Notice>
              {canGenerate && (
                <Button
                  type="button"
                  className="secondary"
                  disabled={
                    disabled ||
                    turn.error_code === "context_limit" ||
                    turn.base_revision !== ticketRevision ||
                    !sameFields(turn.input_fields, fields)
                  }
                  onClick={() => {
                    void generate(turn);
                  }}
                >
                  Retry generation
                </Button>
              )}
              {turn.base_revision !== ticketRevision && (
                <p className="hint">The ticket changed. Generate a new plan from the current ticket.</p>
              )}
            </div>
          ))}

        {!saved && !latest && !loading && !loadError && <p className="muted">No test plan yet.</p>}

        {canGenerate && (
          <div className="stack">
            <TextareaField
              id="test-plan-focus"
              label="Focus (optional)"
              rows={2}
              maxLength={testPlanLimits.focus * 2}
              placeholder="Concentrate on the invitation expiry rules…"
              value={focus}
              disabled={busy || running}
              onChange={event => setFocus(event.target.value)}
            />
            {[...focus].length > testPlanLimits.focus && (
              <Notice danger>The focus note is limited to {testPlanLimits.focus} characters.</Notice>
            )}
            <div className="actions">
              <Button
                type="button"
                disabled={disabled || [...focus].length > testPlanLimits.focus}
                onClick={() => {
                  void generate();
                }}
              >
                {turns.length === 0 ? "Generate test cases" : "Generate again"}
              </Button>
            </div>
            <p className="hint">
              Up to {testPlanLimits.cases} cases, and up to 20 generations per hour. Cases are suggestions: verify them
              against the ticket before trusting them.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
