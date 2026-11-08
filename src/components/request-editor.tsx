"use client";
import { useEffect, useRef, useState } from "react";
import { requestFields, sameFields, type FeatureRequest, type RequestFields } from "@/requests";
import { api, ApiError, failureMessage } from "./http";
import type { ChatTurn } from "@/chat";
import { SuggestionReview } from "./suggestion-review";
import { ChatPanel } from "./chat-panel";
import { Markdown } from "./markdown";
import { deliveryOf } from "@/delivery";
import { TicketDelivery } from "./ticket-delivery";
import { TicketActivity } from "./ticket-activity";
import { Button, Field, Notice, TextareaField } from "./ui";

type Problem = { kind: "conflict" | "ambiguous" | "retry" | "denied"; message: string };
type Action = "save_draft" | "submit" | "save_published" | "delete_draft";

export function RequestScreen({ organisationId, requestId }: { organisationId: string; requestId: string }) {
  const [item, setItem] = useState<FeatureRequest>();
  const [account, setAccount] = useState<{ id: string; role: string }>();
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const path = `/api/organisations/${organisationId}/requests/${requestId}`;
  const listPath = `/organisations/${organisationId}/requests`;
  useEffect(() => {
    let active = true;
    Promise.all([api(path), api("/api/account")]).then(([result, identity]) => {
      if (active) { setItem(result.request); setAccount(identity.account); setError(""); }
    }).catch(failure => { if (active) setError(failureMessage(failure)); });
    return () => { active = false; };
  }, [path, reload]);
  if (error && (!item || !account)) return <section className="stack"><a href={listPath}>Back to requests</a><Notice danger>{error}</Notice><Button onClick={() => { setError(""); setReload(n => n + 1); }}>Retry loading request</Button></section>;
  if (!item || !account) return <Notice>Loading request…</Notice>;
  if (item.author_id === account.id && account.role === "PM") return <RequestEditor key={item.id} initial={item} path={path} listPath={listPath} accountId={account.id} />;
  return <section className="stack request-page"><a href={listPath}>Back to requests</a><h1>{item.fields.title}</h1><RequestMetadata item={item} />
    {error && <Notice danger>{error} Your local input is preserved; retry Refresh saved request.</Notice>}
    <Button className="secondary" onClick={() => setReload(n => n + 1)}>Refresh saved request</Button>
    <TicketDelivery item={item} accountId={account.id} path={path} onSaved={delivery => setItem(current => current ? { ...current, ...deliveryOf(delivery) } : current)} />
    <div className="card"><Markdown text={item.fields.description} /></div>
    <TicketActivity path={path + "/activity"} />
  </section>;
}
function RequestMetadata({ item, compact = false }: { item: FeatureRequest; compact?: boolean }) {
  const details = <><p>Author account: {item.author_id}</p>{item.submitted_at && <p>Submitted: {new Date(item.submitted_at).toLocaleString()}</p>}<p>Last modified: {new Date(item.updated_at).toLocaleString()}</p></>;
  return <div className={`request-metadata ${compact ? "compact-metadata" : ""}`}><span className="badge">{item.submitted_at ? "Submitted" : "Private draft"}</span>{compact ? <details><summary>Ticket details</summary>{details}</details> : details}</div>;
}
function RequestEditor({ initial, path, listPath, accountId }: { initial: FeatureRequest; path: string; listPath: string; accountId: string }) {
  const [starting, setStarting] = useState(!initial.submitted_at && !initial.fields.title.trim());
  const [suggestion, setSuggestion] = useState<ChatTurn | null>(null);
  const suggestionLive = useRef<ChatTurn | null>(null);
  function review(turn: ChatTurn | null) { suggestionLive.current = turn; setSuggestion(turn); }
  const [undo, setUndo] = useState<{ before: RequestFields; after: RequestFields } | null>(null);
  const [applying, setApplying] = useState(false);
  const startingLive = useRef(!initial.submitted_at && !initial.fields.title.trim());
  const problemLive = useRef<Problem | null>(null);
  const [stored, setStored] = useState(initial);
  const [fields, setFields] = useState(initial.fields);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState<"autosave" | "explicit" | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [message, setMessage] = useState("");
  function reportProblem(value: Problem | null) { problemLive.current = value; setProblem(value); }
  const operation = useRef(false);
  const leaving = useRef(false);
  const latest = useRef(fields);
  const persisted = useRef(stored);
  const attempted = useRef<{ action: Action; fields: RequestFields; revision: number } | null>(null);
  const dirty = !sameFields(fields, stored.fields);
  const withinLimits = requestFields.every(field => [...fields[field.key]].length <= field.max);
  const complete = withinLimits && requestFields.every(field => fields[field.key].trim().length > 0);
  const published = stored.submitted_at !== null;
  function adopt(item: FeatureRequest) {
    // Content responses can arrive after an independent delivery write. Keep
    // the newest delivery snapshot without advancing the content revision.
    const next = item.delivery_revision < persisted.current.delivery_revision
      ? { ...item, ...deliveryOf(persisted.current) } : item;
    persisted.current = next; setStored(next);
  }
  function edit(key: keyof RequestFields, value: string) {
    const next = { ...latest.current, [key]: value };
    latest.current = next; setFields(next); setAcknowledged(false); setMessage("");
  }
  async function save(action: Action) {
    if (operation.current || (problem && problem.kind !== "retry")) return;
    if ((action === "submit" || action === "save_published") && (!complete || !acknowledged) || action === "submit" && !persisted.current.due_date) return;
    operation.current = true; setBusy(action === "save_draft" ? "autosave" : "explicit"); setMessage("");
    const snapshot = latest.current;
    const revision = persisted.current.revision;
    attempted.current = { action, fields: snapshot, revision };
    try {
      const result = await api(path, { action, revision, ...(action === "delete_draft" ? {} : { fields: snapshot }), ...(["submit", "save_published"].includes(action) ? { acknowledged: true } : {}) });
      if (action === "delete_draft") { leaving.current = true; window.location.assign(listPath); return; }
      adopt(result.request); reportProblem(null); attempted.current = null;
      if (action !== "save_draft") setAcknowledged(false);
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : 0;
      reportProblem({ kind: status === 409 ? "conflict" : [401, 403].includes(status) ? "denied" : "ambiguous", message: failureMessage(failure) });
    } finally { operation.current = false; setBusy(null); }
  }
  useEffect(() => {
    if (published || !dirty || busy || applying || problem || !withinLimits) return;
    const timer = window.setTimeout(() => { void save("save_draft"); }, 750);
    return () => window.clearTimeout(timer);
    // save reads the current refs; rescheduling follows observable editor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, published, dirty, busy, applying, problem, withinLimits]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (!leaving.current) { event.preventDefault(); event.returnValue = ""; } };
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || event.ctrlKey || event.metaKey || event.shiftKey || link.getAttribute("target") === "_blank" || leaving.current) return;
      const target = new URL(link.getAttribute("href")!, window.location.href);
      if (target.hash && target.origin === window.location.origin && target.pathname === window.location.pathname && target.search === window.location.search) return;
      if (!window.confirm("Leave with unsaved work? Your latest changes may be lost.")) { event.preventDefault(); event.stopPropagation(); }
      else {
        leaving.current = true;
        // Suppress only this departure's native prompt; restore protection if
        // client navigation is cancelled or does not unmount the editor.
        window.setTimeout(() => { leaving.current = false; }, 0);
      }
    };
    window.addEventListener("beforeunload", beforeUnload); document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", click, true); };
  }, [dirty, busy]);
  async function reconcile() {
    if (operation.current) return;
    operation.current = true; setBusy("explicit");
    try {
      const remote: FeatureRequest = (await api(path)).request;
      const attempt = attempted.current;
      if (attempt && remote.revision === attempt.revision + 1 && sameFields(remote.fields, attempt.fields) && (remote.submitted_at !== null) === (attempt.action === "submit" || attempt.action === "save_published")) {
        adopt(remote); setAcknowledged(false); attempted.current = null; reportProblem(null); setMessage("The saved version confirms your change succeeded.");
      } else if (remote.revision === persisted.current.revision && sameFields(remote.fields, persisted.current.fields)) {
        reportProblem({ kind: "retry", message: "The saved version is unchanged. Your local text is preserved; retry explicitly when ready." });
      } else reportProblem({ kind: "conflict", message: "A newer version is saved. Your local text is preserved. Copy it if needed, then reload the saved version to continue." });
    } catch (failure) { reportProblem({ kind: "ambiguous", message: failureMessage(failure) }); }
    finally { operation.current = false; setBusy(null); }
  }
  async function reloadSaved() {
    if (operation.current || !window.confirm("Discard your local edits and load the saved version?")) return;
    operation.current = true; setBusy("explicit");
    try {
      const remote: FeatureRequest = (await api(path)).request;
      adopt(remote); latest.current = remote.fields; setFields(remote.fields); reportProblem(null); setAcknowledged(false); attempted.current = null; setMessage("");
    } catch (failure) { reportProblem({ kind: "denied", message: failureMessage(failure) }); }
    finally { operation.current = false; setBusy(null); }
  }
  async function replaceIfFresh(snapshot: RequestFields, revision: number, next: RequestFields, allowed = () => true) {
    if (!allowed() || operation.current || problemLive.current && problemLive.current.kind !== "retry") return false;
    if (persisted.current.revision !== revision || !sameFields(latest.current, snapshot)) return false;
    operation.current = true; setApplying(true);
    try {
      const remote: FeatureRequest = (await api(path)).request;
      if (!allowed() || problemLive.current && problemLive.current.kind !== "retry") return false;
      if (remote.revision !== revision) {
        reportProblem({ kind: "conflict", message: "Another editor saved a newer ticket. Your text is preserved; reload the saved version before accepting AI changes." });
        return false;
      }
      if (persisted.current.revision !== revision || !sameFields(latest.current, snapshot)) return false;
      latest.current = { ...next }; setFields(latest.current); setAcknowledged(false);
      return true;
    } finally { operation.current = false; setApplying(false); }
  }
  function startManually() { startingLive.current = false; setStarting(false); window.requestAnimationFrame(() => document.getElementById("request-title")?.focus()); }
  async function receiveSuggestion(turn: ChatTurn, firstDraft: boolean) {
    if (!turn.proposal) return;
    try {
      if (firstDraft && startingLive.current && !persisted.current.submitted_at && !turn.input_fields.title.trim()
        && await replaceIfFresh(turn.input_fields, turn.base_revision, turn.proposal, () => startingLive.current && !persisted.current.submitted_at)) {
        setUndo({ before: turn.input_fields, after: turn.proposal }); startManually();
        setMessage("AI draft created. Edit it freely, or undo while it is unchanged."); return;
      }
      review(turn); startManually();
      window.requestAnimationFrame(() => document.getElementById("ticket-suggestion")?.focus());
    } catch (failure) {
      setMessage(failureMessage(failure)); review(turn); startManually();
      window.requestAnimationFrame(() => document.getElementById("ticket-suggestion")?.focus());
    }
  }
  async function acceptSuggestion() {
    const candidate = suggestionLive.current;
    if (!candidate?.proposal) return;
    try {
      if (await replaceIfFresh(candidate.input_fields, candidate.base_revision, candidate.proposal, () => suggestionLive.current === candidate)) {
        review(null); setUndo(null); startManually(); setMessage("AI changes accepted. Review the ticket before publishing.");
      }
    } catch (failure) { setMessage(failureMessage(failure)); }
  }
  async function undoDraft() {
    if (!undo) return;
    try {
      if (await replaceIfFresh(undo.after, persisted.current.revision, undo.before)) {
        setUndo(null); setMessage("AI draft undone. Your original idea is restored.");
      }
    } catch (failure) { setMessage(failureMessage(failure)); }
  }
  const blocked = Boolean(problem && problem.kind !== "retry");
  return <section className="stack request-page ticket-editor">
    <a href={listPath}>Back to requests</a><h1>{stored.fields.title || "New ticket"}</h1><RequestMetadata item={stored} compact />
    <div className="ticket-layout">
    <TicketDelivery item={stored} accountId={accountId} path={path} onSaved={delivery => adopt({ ...persisted.current, ...deliveryOf(delivery) })} />
    <div className="stack ticket-body">
    <p className="ticket-save-status" role="status">{busy ? "Saving…" : problem ? "Save failed — local text preserved" : dirty ? "Unsaved changes" : "Saved"}</p>
    {problem && <div className="stack"><Notice danger>{problem.message}</Notice><div className="actions">
      {problem.kind === "ambiguous" && <Button className="secondary" disabled={Boolean(busy)} onClick={reconcile}>Check saved version</Button>}
      {problem.kind === "retry" && !published && <Button disabled={Boolean(busy)} onClick={() => save("save_draft")}>Retry draft save</Button>}
      <Button className="secondary" disabled={Boolean(busy)} onClick={reloadSaved}>Reload saved version and discard edits</Button>
    </div></div>}
    {message && <Notice>{message}</Notice>}
    {!withinLimits && <Notice danger>Title is limited to 160 characters and description to 24,000. Your local text is preserved; shorten it before saving.</Notice>}
    {undo && <div className="actions"><Button className="secondary" disabled={Boolean(busy) || applying || blocked || !sameFields(fields, undo.after)} onClick={undoDraft}>Undo AI draft</Button></div>}
    <ChatPanel path={path + "/chat"} fields={fields} revision={stored.revision} canSend={!busy && !applying && !blocked && withinLimits && (published || !dirty)} starting={starting} onManual={startManually} onRoughIdea={value => edit("description", value)} onSuggestion={receiveSuggestion}>
    {suggestion && <SuggestionReview turn={suggestion} fields={fields} revision={stored.revision} disabled={Boolean(busy) || applying || blocked} onAccept={() => { void acceptSuggestion(); }} onDiscard={() => { review(null); window.requestAnimationFrame(() => document.getElementById("request-description")?.focus()); }} />}
    <div hidden={starting}>
    <form className="card stack" aria-label="Request editor" onSubmit={event => { event.preventDefault(); void save(published ? "save_published" : "submit"); }} aria-busy={Boolean(busy)}>
      {requestFields.map(field => field.key === "title" ? <Field key={field.key} id={`request-${field.key}`} label={field.label} maxLength={field.max * 2} value={fields[field.key]} disabled={busy === "explicit"} onChange={event => edit(field.key, event.target.value)} /> : <TextareaField key={field.key} id={`request-${field.key}`} label={field.label} maxLength={field.max * 2} value={fields[field.key]} disabled={busy === "explicit"} onChange={event => edit(field.key, event.target.value)} />)}
      <p className="hint">{published ? "Published edits are saved only when you choose Save changes." : "Drafts autosave after a short pause. Only you can read this draft."} Title and description need content to publish. Save a due date in delivery details before first publication. Section headings are optional.</p>
      <label className="checkbox-field"><input type="checkbox" checked={acknowledged} disabled={Boolean(busy)} onChange={event => setAcknowledged(event.target.checked)} />I acknowledge the assumptions and unresolved questions.</label>
      <div className="actions"><Button disabled={Boolean(busy) || applying || blocked || !complete || !acknowledged || (published ? !dirty : dirty || !stored.due_date)}>{published ? "Save changes" : "Submit request"}</Button>
        {!published && <Button type="button" className="secondary" disabled={Boolean(busy) || applying || blocked} onClick={() => { if (window.confirm("Delete this private draft? This cannot be undone.")) void save("delete_draft"); }}>Delete draft</Button>}
      </div>
    </form>
    </div>
    </ChatPanel>
    </div></div>
    {published && <TicketActivity path={path + "/activity"} />}
  </section>;
}
