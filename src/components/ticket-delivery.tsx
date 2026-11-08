"use client";
import { useEffect, useRef, useState } from "react";
import { deadlineLabel, ticketPriorities, ticketStatuses, type Delivery, type TicketStatus, type TicketPriority } from "@/delivery";
import type { FeatureRequest } from "@/requests";
import { api, ApiError, failureMessage } from "./http";
import { Button, Field, Notice } from "./ui";
import { TicketMembers } from "./ticket-members";
export function TicketDelivery({ item, accountId, path, onSaved }: { item: FeatureRequest; accountId: string; path: string; onSaved: (delivery: Delivery) => void }) {
  const [saved, setSaved] = useState<Delivery>(item);
  const [dueDate, setDueDate] = useState(item.due_date ?? ""); const [priority, setPriority] = useState(item.priority);
  const [status, setStatus] = useState(item.status); const [assigned, setAssigned] = useState(item.assignee_ids);
  const [busy, setBusy] = useState(false); const operation = useRef(false);
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [blocked, setBlocked] = useState(false);
  const author = item.author_id === accountId;
  const published = Boolean(item.submitted_at);
  const canStatus = published && (author || saved.assignee_ids.includes(accountId));
  const dirty = dueDate !== (saved.due_date ?? "") || priority !== saved.priority || status !== saved.status || JSON.stringify(assigned) !== JSON.stringify(saved.assignee_ids);
  // Adopt a refreshed snapshot only while clean; pending status edits retain
  // their original revision so concurrent writes still produce a conflict.
  if (!dirty && !busy && item.delivery_revision > saved.delivery_revision) {
    setSaved(item); setDueDate(item.due_date ?? ""); setPriority(item.priority);
    setStatus(item.status); setAssigned(item.assignee_ids);
  }
  useEffect(() => {
    if (!dirty && !busy) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, busy]);
  function adopt(next: Delivery) { setSaved(next); setDueDate(next.due_date ?? ""); setPriority(next.priority); setStatus(next.status); setAssigned(next.assignee_ids); onSaved(next); }
  async function save() {
    if (operation.current || blocked) return; operation.current = true; setBusy(true); setError(""); setMessage("");
    const changes: Record<string, unknown> = {};
    if (author) {
      if (dueDate !== (saved.due_date ?? "")) changes.due_date = dueDate || null;
      if (priority !== saved.priority) changes.priority = priority;
      if (JSON.stringify(assigned) !== JSON.stringify(saved.assignee_ids)) changes.assignee_ids = assigned;
    }
    if (canStatus && status !== saved.status) changes.status = status;
    try { const result = await api(path + "/delivery", { revision: saved.delivery_revision, changes }); adopt(result.request); setMessage("Delivery details saved."); }
    catch (failure) { setError(failureMessage(failure)); setBlocked(!(failure instanceof ApiError) || [401,403,409,503].includes(failure.status)); }
    finally { operation.current = false; setBusy(false); }
  }
  async function reload() {
    if (operation.current || dirty && !window.confirm("Discard local delivery edits and reload saved details?")) return;
    operation.current = true; setBusy(true);
    try { adopt((await api(path)).request); setBlocked(false); setError(""); setMessage("Saved delivery details loaded."); }
    catch (failure) { setError(failureMessage(failure)); } finally { operation.current = false; setBusy(false); }
  }
  return <div className="stack">
    {error && <Notice danger>{error}</Notice>}{message && <Notice>{message}</Notice>}
    {author || canStatus ? <form className="stack" aria-label="Delivery fields" onSubmit={event => { event.preventDefault(); void save(); }}>
      <TicketDeliveryFields item={item} accountId={accountId} value={{ ...saved, due_date: dueDate || null, priority, status, assignee_ids: assigned }} disabled={busy || blocked} onChange={value => { setDueDate(value.due_date ?? ""); setPriority(value.priority); setStatus(value.status); setAssigned(value.assignee_ids); }} />
      <p className="hint">{dirty ? "Unsaved delivery changes." : ""}</p>
      <div className="actions"><Button disabled={busy || blocked || !dirty}>Update</Button>{error && <Button type="button" className="secondary" disabled={busy} onClick={reload}>Reload delivery details</Button>}</div>
    </form> : <section className="delivery-fields-section" aria-label="Ticket delivery details">
      <dl className="delivery-fields read-only-fields"><div><dt>Delivery status</dt><dd>{published ? ticketStatuses[saved.status] : ticketStatuses.to_do}</dd></div><div><dt>Priority</dt><dd>{ticketPriorities[saved.priority]}</dd></div><div><dt>Due date</dt><dd>{deadlineLabel({ ...saved, submitted_at: item.submitted_at })}</dd></div><div><dt>Assignees</dt><dd>{saved.assignee_ids.length ? saved.assignee_ids.join(", ") : "Unassigned"}</dd></div></dl>
    </section>}
  </div>;
}

export function TicketDeliveryFields({ item, accountId, value, disabled, onChange, formId }: { item: FeatureRequest; accountId: string; value: Delivery; formId?: string; disabled: boolean; onChange: (value: Delivery) => void }) {
  const author = item.author_id === accountId;
  const published = Boolean(item.submitted_at);
  const canStatus = published && (author || item.assignee_ids.includes(accountId));
  return <section className="stack delivery-fields-section" aria-label="Ticket delivery details">
      <div className="delivery-fields">
        <div className="field">{canStatus || !published ? <label htmlFor="ticket-status">Delivery status</label> : <span className="field-label">Delivery status</span>}{canStatus || !published
          ? <select id="ticket-status" value={published ? value.status : "to_do"} disabled={disabled || !canStatus} onChange={event => onChange({ ...value, status: event.target.value as TicketStatus })}>{Object.entries(ticketStatuses).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
          : <span className="field-value">{published ? ticketStatuses[value.status] : ticketStatuses.to_do}</span>}</div>
        <div className="field">{author ? <label htmlFor="ticket-priority">Priority</label> : <span className="field-label">Priority</span>}{author
          ? <select id="ticket-priority" value={value.priority} disabled={disabled} onChange={event => onChange({ ...value, priority: event.target.value as TicketPriority })}>{Object.entries(ticketPriorities).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
          : <span className="field-value">{ticketPriorities[value.priority]}</span>}</div>
        {author ? <Field id="ticket-due" label="Due date" form={formId} type="date" min="0001-01-01" max="9999-12-31" value={(value.due_date ?? "")} disabled={disabled} onChange={event => onChange({ ...value, due_date: event.target.value || null })} />
          : <div className="field"><span className="field-label">Due date</span><span className="field-value">{deadlineLabel({ ...value, submitted_at: item.submitted_at })}</span></div>}
      </div>
      {author ? <details className="assignee-field"><summary>Assignees ({value.assignee_ids.length}/5)</summary><p className="hint">{value.assignee_ids.length ? value.assignee_ids.join(", ") : "Unassigned"}</p><Button type="button" className="secondary" disabled={disabled || value.assignee_ids.length >= 5 || value.assignee_ids.includes(accountId)} onClick={() => onChange({ ...value, assignee_ids: [...value.assignee_ids, accountId] })}>Assign me</Button><TicketMembers organisationId={item.organisation_id} selected={value.assignee_ids} onChange={assignee_ids => onChange({ ...value, assignee_ids })} disabled={disabled} /></details>
        : <p className="hint">Assigned accounts: {value.assignee_ids.join(", ")}</p>}
  </section>;
}

export function CopyTicketLink() {
  const [message, setMessage] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(window.location.href); setMessage("Ticket link copied."); }
    catch { setMessage("Could not copy the link. Copy this page’s address from your browser."); }
  }
  return <div className="copy-ticket-link"><Button type="button" className="secondary" onClick={copy}>Copy ticket link</Button>{message && <span className="hint" role="status">{message}</span>}</div>;
}
