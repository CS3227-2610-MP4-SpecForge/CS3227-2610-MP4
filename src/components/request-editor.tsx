"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { requestFields, sameFields, type FeatureRequest, type RequestFields, type TicketRead } from "@/requests";
import { api, ApiError, failureMessage } from "./http";
import type { ChatTurn } from "@/chat";
import { SuggestionReview } from "./suggestion-review";
import { ChatPanel } from "./chat-panel";
import { Markdown } from "./markdown";
import { deliveryOf, deliveryChanges, sameDelivery, type Delivery } from "@/delivery";
import { TicketDelivery, TicketDeliveryFields, CopyTicketLink } from "./ticket-delivery";
import { TicketVisibility } from "./ticket-visibility";
import { TicketActivity } from "./ticket-activity";
import { TestPlanPanel } from "./test-plan-panel";
import { BackLink, Button, Field, Notice } from "./ui";

type Problem = { kind: "conflict" | "ambiguous" | "retry" | "denied"; message: string };
type Action = "save_draft" | "submit" | "save_published" | "delete_draft";

export function RequestScreen({ organisationId, requestId }: { organisationId: string; requestId: string }) {
  const [item, setItem] = useState<TicketRead>();
  const [organisationName, setOrganisationName] = useState<string>();
  const [account, setAccount] = useState<{ id: string; role: string }>();
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const path = `/api/organisations/${organisationId}/requests/${requestId}`;
  const listPath = `/organisations/${organisationId}/requests`;
  useEffect(() => {
    let active = true;
    Promise.all([api(path), api("/api/account"), api(`/api/organisations/${organisationId}`)]).then(([result, identity, organisation]) => {
      if (active) { setItem(result.request); setAccount(identity.account); setOrganisationName(organisation.organisation.name); setError(""); }
    }).catch(failure => { if (active) setError(failureMessage(failure)); });
    return () => { active = false; };
  }, [path, organisationId, reload]);
  if (error && (!item || !account || !organisationName)) return <section className="stack"><BackLink href={listPath} fullPage>Back to requests</BackLink><Notice danger>{error}</Notice><Button onClick={() => { setError(""); setReload(n => n + 1); }}>Retry loading request</Button></section>;
  if (!item || !account || !organisationName) return <Notice>Loading request…</Notice>;
  if (item.author_id === account.id && account.role === "PM") return <RequestEditor key={item.id} initial={item} path={path} listPath={listPath} accountId={account.id} organisationName={organisationName} />;
  return <section className="stack request-page ticket-reader">
    <div className="ticket-topbar"><BackLink href={listPath} fullPage>Back to requests</BackLink><CopyTicketLink /></div>
    {error && <Notice danger>{error} Your local input is preserved; retry Refresh saved request.</Notice>}
    <div className="card stack ticket-content">
      <TicketVisibility published={Boolean(item.submitted_at)} organisationName={organisationName} />
      <h1 className="ticket-title">{item.fields.title}</h1>
      <TicketDelivery item={item} accountId={account.id} path={path} onSaved={delivery => setItem(current => current ? { ...current, ...deliveryOf(delivery) } : current)} />
      <div className="stack"><h2>Description</h2><Markdown text={item.fields.description} /></div>
      <Button className="secondary" onClick={() => setReload(n => n + 1)}>Refresh saved request</Button>
      <RequestMetadata item={item} author={item.author_username} />
    </div>
    {item.submitted_at && <TestPlanPanel path={path + "/test-plan"} fields={item.fields} ticketRevision={item.revision} canGenerate={account.role === "Developer"} />}
    <TicketActivity path={path + "/activity"} />
  </section>;
}

function RequestMetadata({ item, author, children }: { item: FeatureRequest; author: string; children?: ReactNode }) {
  return <section className="request-metadata ticket-about" aria-labelledby="ticket-about-heading">
    <h2 id="ticket-about-heading">About this ticket</h2>
    <p>Author: {author}</p>
    {item.submitted_at && <p>Published: {new Date(item.submitted_at).toLocaleString()}</p>}
    <p>Last modified: {new Date(item.updated_at).toLocaleString()}</p>
    {children}
  </section>;
}
function RequestEditor({ initial, path, listPath, accountId, organisationName }: { initial: TicketRead; path: string; listPath: string; accountId: string; organisationName: string }) {
  const [starting, setStarting] = useState(!initial.submitted_at && !initial.fields.title.trim());
  const [suggestion, setSuggestion] = useState<ChatTurn | null>(null);
  const suggestionLive = useRef<ChatTurn | null>(null);
  function review(turn: ChatTurn | null) { suggestionLive.current = turn; setSuggestion(turn); }
  const [undo, setUndo] = useState<{ before: RequestFields; after: RequestFields } | null>(null);
  const [applying, setApplying] = useState(false);
  const startingLive = useRef(!initial.submitted_at && !initial.fields.title.trim());
  const problemLive = useRef<Problem | null>(null);
  const [stored, setStored] = useState<FeatureRequest>(initial);
  const [fields, setFields] = useState(initial.fields);
  const [descriptionMode, setDescriptionMode] = useState<"write" | "preview">("write");
  const [validation, setValidation] = useState("");
  const [delivery, setDelivery] = useState<Delivery>(deliveryOf(initial));
  const latestDelivery = useRef(delivery);
  function editDelivery(value: Delivery) {
    latestDelivery.current = value; setDelivery(value); setMessage(""); setValidation("");
  }
  const [busy, setBusy] = useState<"autosave" | "explicit" | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [message, setMessage] = useState("");
  function reportProblem(value: Problem | null) { problemLive.current = value; setProblem(value); }
  const operation = useRef(false);
  const leaving = useRef(false);
  const latest = useRef(fields);
  const persisted = useRef(stored);
  const attempted = useRef<{ action: Action; fields: RequestFields; revision: number; delivery: Delivery; deliveryRevision: number; deliveryChanged: boolean } | null>(null);
  const dirty = !sameFields(fields, stored.fields) || !sameDelivery(delivery, stored);
  const withinLimits = requestFields.every(field => [...fields[field.key]].length <= field.max);
  const complete = withinLimits && requestFields.every(field => fields[field.key].trim().length > 0);
  const published = stored.submitted_at !== null;
  function adopt(item: FeatureRequest) {
    persisted.current = item; setStored(item);
  }
  function edit(key: keyof RequestFields, value: string) {
    if (key === "title" && value.trim()) { startingLive.current = false; setStarting(false); }
    const next = { ...latest.current, [key]: value };
    latest.current = next; setFields(next); setMessage(""); setValidation("");
  }
  function focusDescription() {
    setDescriptionMode("write");
    window.requestAnimationFrame(() => document.getElementById("request-description")?.focus());
  }
  async function save(action: Action) {
    if (operation.current || (problem && problem.kind !== "retry")) return;
    if ((action === "submit" || action === "save_published") && !complete) {
      if (descriptionMode === "preview" && !fields.description.trim()) focusDescription();
      setValidation("Enter a title and description within the field limits."); return;
    }
    operation.current = true; setBusy(action === "save_draft" ? "autosave" : "explicit"); setMessage("");
    const snapshot = latest.current;
    const revision = persisted.current.revision;
    const deliverySnapshot = latestDelivery.current;
    const changes = deliveryChanges(deliverySnapshot, persisted.current);
    const deliveryRevision = persisted.current.delivery_revision;
    attempted.current = { action, fields: snapshot, revision, delivery: deliverySnapshot, deliveryRevision, deliveryChanged: Object.keys(changes).length > 0 };
    try {
      // Publish/Update explicitly confirm the save; keep the legacy wire flag.
      const result = await api(path, { action, revision, ...(action === "delete_draft" ? {} : { fields: snapshot, delivery: { revision: deliveryRevision, changes } }), ...(["submit", "save_published"].includes(action) ? { acknowledged: true } : {}) });
      if (action === "delete_draft") { leaving.current = true; window.location.assign(listPath); return; }
      adopt(result.request); reportProblem(null); attempted.current = null;
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
  }, [fields, delivery, published, dirty, busy, applying, problem, withinLimits]);
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
      if (attempt && remote.revision === attempt.revision + 1 && sameFields(remote.fields, attempt.fields) && remote.delivery_revision === attempt.deliveryRevision + Number(attempt.deliveryChanged) && sameDelivery(remote, attempt.delivery) && (remote.submitted_at !== null) === (attempt.action === "submit" || attempt.action === "save_published")) {
        adopt(remote); attempted.current = null; reportProblem(null); setMessage("The saved version confirms your change succeeded.");
      } else if (remote.revision === persisted.current.revision && sameFields(remote.fields, persisted.current.fields) && remote.delivery_revision === persisted.current.delivery_revision && sameDelivery(remote, persisted.current)) {
        reportProblem({ kind: "retry", message: "The saved version is unchanged. Your local edits are preserved; retry explicitly when ready." });
      } else reportProblem({ kind: "conflict", message: "A newer version is saved. Your local edits are preserved. Copy it if needed, then reload the saved version to continue." });
    } catch (failure) { reportProblem({ kind: "ambiguous", message: failureMessage(failure) }); }
    finally { operation.current = false; setBusy(null); }
  }
  async function reloadSaved() {
    if (operation.current || !window.confirm("Discard your local edits and load the saved version?")) return;
    operation.current = true; setBusy("explicit");
    try {
      const remote: FeatureRequest = (await api(path)).request;
      adopt(remote); latest.current = remote.fields; setFields(remote.fields); latestDelivery.current = deliveryOf(remote); setDelivery(latestDelivery.current); reportProblem(null); attempted.current = null; setMessage("");
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
        reportProblem({ kind: "conflict", message: "Another editor saved a newer ticket. Your edits are preserved; reload the saved version before accepting AI changes." });
        return false;
      }
      if (persisted.current.revision !== revision || !sameFields(latest.current, snapshot)) return false;
      latest.current = { ...next }; setFields(latest.current);
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
  const pendingStatus = busy ? "Saving…" : problem ? "Save failed — local edits preserved" : dirty ? "Unsaved changes" : null;
  const autosavedAt = published ? null : stored.last_autosaved_at;
  const savedAt = autosavedAt ?? (published || stored.revision > 1 ? stored.updated_at : null);
  return <section className="stack request-page ticket-editor">
    <ChatPanel path={path + "/chat"} fields={fields} revision={stored.revision} canSend={!busy && !applying && !blocked && withinLimits && (published || !dirty)} starting={starting} onManual={startManually} onRoughIdea={value => edit("description", value)} onSuggestion={receiveSuggestion}
      header={<><BackLink href={listPath} fullPage>Back to requests</BackLink><CopyTicketLink /></>}
      review={<>
        {message && <Notice>{message}</Notice>}
        {undo && <div className="actions"><Button className="secondary" disabled={Boolean(busy) || applying || blocked || !sameFields(fields, undo.after)} onClick={undoDraft}>Undo AI draft</Button></div>}
        {suggestion && <SuggestionReview turn={suggestion} fields={fields} revision={stored.revision} disabled={Boolean(busy) || applying || blocked} onAccept={() => { void acceptSuggestion(); }} onDiscard={() => { review(null); focusDescription(); }} />}
      </>}>
      <div className="card stack ticket-content">
        <TicketVisibility published={published} organisationName={organisationName} />
        <Field id="request-title" label="Title" form="request-content" required maxLength={320} value={fields.title} disabled={busy === "explicit"} onChange={event => edit("title", event.target.value)} />
        <TicketDeliveryFields item={stored} accountId={accountId} value={delivery} formId="request-content" disabled={busy === "explicit" || applying || blocked} onChange={editDelivery} />
        {problem && <div className="stack"><Notice danger>{problem.message}</Notice><div className="actions">
          {problem.kind === "ambiguous" && <Button className="secondary" disabled={Boolean(busy)} onClick={reconcile}>Check saved version</Button>}
          {problem.kind === "retry" && !published && <Button disabled={Boolean(busy)} onClick={() => save("save_draft")}>Retry draft save</Button>}
          <Button className="secondary" disabled={Boolean(busy)} onClick={reloadSaved}>Reload saved version and discard edits</Button>
        </div></div>}
        {!withinLimits && <Notice danger>Title is limited to 160 characters and description to 24,000. Your local edits are preserved; shorten it before saving.</Notice>}
        <form id="request-content" className="stack" aria-label="Request editor" onSubmit={event => { event.preventDefault(); void save(published ? "save_published" : "submit"); }} aria-busy={Boolean(busy)}>
          <div className="field">
            <div className="ticket-description-header">
              <label htmlFor="request-description">Description</label>
              <div className="ticket-description-tabs" role="tablist" aria-label="Description mode" onKeyDown={event => {
                let next: typeof descriptionMode;
                switch (event.key) {
                  case "ArrowLeft":
                  case "ArrowRight": next = descriptionMode === "write" ? "preview" : "write"; break;
                  case "Home": next = "write"; break;
                  case "End": next = "preview"; break;
                  default: return;
                }
                event.preventDefault();
                setDescriptionMode(next);
                event.currentTarget.querySelector<HTMLButtonElement>(`#description-${next}-tab`)?.focus();
              }}>
                {(["write", "preview"] as const).map(mode => <Button key={mode} type="button" className="secondary" role="tab"
                  id={`description-${mode}-tab`} aria-controls={`description-${mode}-panel`} aria-selected={descriptionMode === mode}
                  tabIndex={descriptionMode === mode ? 0 : -1} onClick={() => setDescriptionMode(mode)}>
                  {mode === "write" ? "Write" : "Preview"}
                </Button>)}
              </div>
            </div>
            <div id="description-write-panel" role="tabpanel" aria-labelledby="description-write-tab" hidden={descriptionMode !== "write"}>
              <textarea id="request-description" rows={4} required={descriptionMode === "write"} maxLength={48000} value={fields.description}
                disabled={busy === "explicit"} onChange={event => edit("description", event.target.value)} />
            </div>
            <div id="description-preview-panel" className="ticket-description-preview" role="tabpanel" aria-labelledby="description-preview-tab"
              tabIndex={0} hidden={descriptionMode !== "preview"}>
              {descriptionMode === "preview" && (fields.description.trim()
                ? <Markdown text={fields.description} />
                : <p className="hint">Nothing to preview yet.</p>)}
            </div>
          </div>
          {validation && <Notice danger>{validation}</Notice>}
          <div className="actions"><Button disabled={Boolean(busy) || applying || blocked || (published && !dirty)}>{published ? "Update" : "Publish"}</Button>
            {!published && <Button type="button" className="secondary" disabled={Boolean(busy) || applying || blocked} onClick={() => { if (window.confirm("Delete this private draft? This cannot be undone.")) void save("delete_draft"); }}>Delete draft</Button>}
          </div>
        </form>
        <RequestMetadata item={stored} author={initial.author_username}>
          <p className="ticket-save-status" role="status">
            {pendingStatus ?? (savedAt
              ? <>{autosavedAt ? "Last autosaved: " : "Last saved: "}<time dateTime={savedAt}>{new Date(savedAt).toLocaleString()}</time></>
              : "Awaiting first autosave")}
          </p>
        </RequestMetadata>
      </div>
      {published && <TestPlanPanel path={path + "/test-plan"} fields={stored.fields} ticketRevision={stored.revision} canGenerate={false} />}
      {published && <TicketActivity path={path + "/activity"} />}
    </ChatPanel>
  </section>;
}
