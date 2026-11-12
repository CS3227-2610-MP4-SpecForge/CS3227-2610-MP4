"use client";
import { useEffect, useRef, useState } from "react";
import type { TicketActivity as Entry } from "@/delivery";
import { assigneeUsernameLabel, formerAccountLabel } from "@/usernames";
import { api, failureMessage } from "./http";
import { useConfirm } from "./confirm";
import { Button, Notice, TextareaField, useNotificationState } from "./ui";
const eventLabels = {
  published: "Published this ticket",
  requirements_updated: "Updated the requirements",
  delivery_updated: "Updated delivery details",
  comment: "Commented",
};
const fieldLabels: Record<string, string> = { due_date: "Due date", priority: "Priority", status: "Status" };
function valueLabel(value: unknown): string {
  return value === null
    ? "Unset"
    : Array.isArray(value)
      ? value.join(", ") || "Unassigned"
      : String(value).replaceAll("_", " ");
}
export function TicketActivity({ path }: { path: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useNotificationState(true);
  const [reload, setReload] = useState(0);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [, setError] = useNotificationState(true);
  const [, setMessage] = useNotificationState(false);
  const confirm = useConfirm();
  const generation = useRef(0);
  const [attempt, setAttempt] = useState<{ creationKey: string; body: string } | null>(null);
  const operation = useRef(false);
  useEffect(() => {
    let active = true;
    api(path)
      .then(result => {
        if (active) {
          setEntries(result.entries);
          setCursor(result.next_cursor);
          setLoadError("");
        }
      })
      .catch(failure => {
        if (active) setLoadError(failureMessage(failure));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, reload, setLoadError]);
  useEffect(() => {
    if (!body) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [body]);
  async function more() {
    if (loading) return;
    const pageGeneration = generation.current;
    setLoading(true);
    try {
      const result = await api(`${path}?before=${cursor}`);
      if (generation.current !== pageGeneration) return;
      setEntries(current => [
        ...current,
        ...result.entries.filter((entry: Entry) => !current.some(old => old.id === entry.id)),
      ]);
      setCursor(result.next_cursor);
      setLoadError("");
    } catch (failure) {
      if (generation.current === pageGeneration) setLoadError(failureMessage(failure));
    } finally {
      if (generation.current === pageGeneration) setLoading(false);
    }
  }
  async function post() {
    if (operation.current || !body.trim() || [...body].length > 4000) return;
    operation.current = true;
    setPosting(true);
    setError("");
    setMessage("");
    const submitted = attempt ?? { creationKey: crypto.randomUUID(), body };
    setAttempt(submitted);
    try {
      await api(path, submitted);
      setAttempt(null);
      setBody("");
      setMessage("Comment posted.");
      generation.current++;
      setLoading(true);
      setReload(n => n + 1);
    } catch (failure) {
      setError(failureMessage(failure));
    } finally {
      operation.current = false;
      setPosting(false);
    }
  }
  return (
    <section className="card stack activity-panel" aria-label="Team discussion and activity">
      <div className="section-title">
        <h2>Team discussion & activity</h2>
        <Button
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => {
            generation.current++;
            setLoading(true);
            setReload(n => n + 1);
          }}
        >
          Refresh activity
        </Button>
      </div>
      <p className="hint">Visible to current organisation members. AI discussions remain private.</p>
      <form
        className="stack"
        onSubmit={event => {
          event.preventDefault();
          void post();
        }}
      >
        <TextareaField
          id="ticket-comment"
          label="Comment"
          value={body}
          maxLength={8000}
          disabled={posting || Boolean(attempt)}
          onChange={event => setBody(event.target.value)}
        />

        {[...body].length > 4000 && (
          <Notice danger>Comments are limited to 4,000 characters. Your text is preserved.</Notice>
        )}
        <div className="actions">
          <Button disabled={posting || !body.trim() || [...body].length > 4000}>
            {attempt ? "Retry comment" : "Post comment"}
          </Button>
          {attempt && (
            <Button
              type="button"
              className="secondary"
              disabled={posting}
              onClick={async () => {
                const restart = await confirm({
                  title: "Start a new comment attempt?",
                  message:
                    "The previous attempt may already be posted. Check activity first to avoid a duplicate comment.",
                  confirmLabel: "Start new attempt",
                });
                if (restart) {
                  setAttempt(null);
                  setError("");
                }
              }}
            >
              Start a new comment attempt
            </Button>
          )}
        </div>
      </form>
      {loadError && <p className="hint">Use Refresh activity to retry.</p>}
      {loading && <p role="status">Loading activity…</p>}
      {!loading && !loadError && entries.length === 0 && <p className="muted">No activity yet.</p>}
      <ol className="organisation-list activity-list">
        {entries.map(entry => (
          <li key={entry.id} className="activity-entry">
            <p className="hint">
              {entry.actor_id ? (entry.actor_username ?? formerAccountLabel) : "System"} ·{" "}
              {new Date(entry.created_at).toLocaleString()}
            </p>
            <p>
              <strong>{eventLabels[entry.kind]}</strong>
            </p>
            {entry.kind === "comment" && <p className="request-text">{entry.body}</p>}
            {entry.kind === "delivery_updated" && (
              <ul>
                {Object.entries(entry.changes).map(([field, change]) => {
                  if (field === "assignee_ids") {
                    const names = entry.assignment_usernames;
                    return (
                      <li key={field}>
                        Assignees:{" "}
                        {names
                          ? `${assigneeUsernameLabel(names.from)} → ${assigneeUsernameLabel(names.to)}`
                          : "Unavailable"}
                      </li>
                    );
                  }
                  return (
                    <li key={field}>
                      {fieldLabels[field] ?? field}: {valueLabel(change.from)} → {valueLabel(change.to)}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {cursor && (
        <Button type="button" className="secondary" disabled={loading} onClick={more}>
          Load older activity
        </Button>
      )}
    </section>
  );
}
