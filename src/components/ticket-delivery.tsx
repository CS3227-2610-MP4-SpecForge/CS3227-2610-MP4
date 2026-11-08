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
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); setMessage("Ticket link copied."); }
    catch { setError("Could not copy the link. Copy this page’s address from your browser."); }
  }
  return <aside className="card stack delivery-panel" aria-label="Ticket delivery details">
    <div className="section-title"><h2>SF-{saved.ticket_number}</h2><Button type="button" className="secondary" onClick={copyLink}>Copy ticket link</Button></div>
    <div className="ticket-badges"><span className="badge">{published ? ticketStatuses[saved.status] : "Private draft"}</span><span className="badge">{ticketPriorities[saved.priority]} priority</span><span>{deadlineLabel({ ...saved, submitted_at: item.submitted_at })}</span></div>
    {error && <Notice danger>{error}</Notice>}{message && <Notice>{message}</Notice>}
    {author || canStatus ? <form className="stack" onSubmit={event => { event.preventDefault(); void save(); }}>
      {author && <>
        <div className="delivery-fields"><Field id="ticket-due" label="Due date" type="date" min="0001-01-01" max="9999-12-31" value={dueDate} disabled={busy || blocked} onChange={event => setDueDate(event.target.value)} hint={published ? "Published tickets need a deadline." : "Save a deadline before publishing."} />
        <div className="field"><label htmlFor="ticket-priority">Priority</label><select id="ticket-priority" value={priority} disabled={busy || blocked} onChange={event => setPriority(event.target.value as TicketPriority)}>{Object.entries(ticketPriorities).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
        <details><summary>Assignees ({assigned.length}/5)</summary><Button type="button" className="secondary" disabled={busy || blocked || assigned.length >= 5 || assigned.includes(accountId)} onClick={() => setAssigned(current => [...current, accountId])}>Assign me</Button><TicketMembers organisationId={item.organisation_id} selected={assigned} onChange={setAssigned} disabled={busy || blocked} /></details>
      </>}
      {canStatus && <div className="field"><label htmlFor="ticket-status">Delivery status</label><select id="ticket-status" value={status} disabled={busy || blocked} onChange={event => setStatus(event.target.value as TicketStatus)}>{Object.entries(ticketStatuses).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
      <p className="hint">{dirty ? "Unsaved delivery changes." : "Delivery details are saved separately from ticket text."}</p>
      <div className="actions"><Button disabled={busy || blocked || !dirty}>Save delivery details</Button><Button type="button" className="secondary" disabled={busy} onClick={reload}>Reload delivery details</Button></div>
    </form> : <><p>Assignees: {saved.assignee_ids.length ? saved.assignee_ids.join(", ") : "Unassigned"}</p><Button type="button" className="secondary" disabled={busy} onClick={reload}>Refresh delivery details</Button></>}
    {canStatus && !author && <p className="hint">Assigned accounts: {saved.assignee_ids.join(", ")}</p>}
  </aside>;
}
