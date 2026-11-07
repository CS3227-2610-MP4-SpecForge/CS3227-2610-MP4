"use client";
import { useEffect, useRef, useState } from "react";
import { requestFields, sameFields, type FeatureRequest, type RequestFields } from "@/requests";
import { api, ApiError, failureMessage } from "./http";
import type { ChatTurn } from "@/chat";
import { ChatPanel } from "./chat-panel";
import { Markdown } from "./markdown";
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
  if (error) return <section className="stack"><a href={listPath}>Back to requests</a><Notice danger>{error}</Notice><Button onClick={() => { setError(""); setReload(n => n + 1); }}>Retry loading request</Button></section>;
  if (!item || !account) return <Notice>Loading request…</Notice>;
  if (item.author_id === account.id && account.role === "PM") return <RequestEditor key={item.id} initial={item} path={path} listPath={listPath} />;
  return <section className="stack request-page"><a href={listPath}>Back to requests</a><h1>{item.fields.title}</h1><RequestMetadata item={item} />
    <Button className="secondary" onClick={() => setReload(n => n + 1)}>Refresh saved request</Button>
    <div className="card"><Markdown text={item.fields.description} /></div>
  </section>;
}
function RequestMetadata({ item }: { item: FeatureRequest }) {
  return <div className="request-metadata"><span className="badge">{item.submitted_at ? "Submitted" : "Private draft"}</span><p>Author account: {item.author_id}</p>{item.submitted_at && <p>Submitted: {new Date(item.submitted_at).toLocaleString()}</p>}<p>Last modified: {new Date(item.updated_at).toLocaleString()}</p></div>;
}
function RequestEditor({ initial, path, listPath }: { initial: FeatureRequest; path: string; listPath: string }) {
  const [tab, setTab] = useState<"task" | "chat">("task");
  const [stored, setStored] = useState(initial);
  const [fields, setFields] = useState(initial.fields);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState<"autosave" | "explicit" | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [message, setMessage] = useState("");
  const operation = useRef(false);
  const leaving = useRef(false);
  const latest = useRef(fields);
  const persisted = useRef(stored);
  const attempted = useRef<{ action: Action; fields: RequestFields; revision: number } | null>(null);
  const dirty = !sameFields(fields, stored.fields);
  const withinLimits = requestFields.every(field => [...fields[field.key]].length <= field.max);
  const complete = withinLimits && requestFields.every(field => fields[field.key].trim().length > 0);
  const published = stored.submitted_at !== null;
  function adopt(item: FeatureRequest) { persisted.current = item; setStored(item); }
  function edit(key: keyof RequestFields, value: string) {
    const next = { ...latest.current, [key]: value };
    latest.current = next; setFields(next); setAcknowledged(false); setMessage("");
  }
  async function save(action: Action) {
    if (operation.current || (problem && problem.kind !== "retry")) return;
    if ((action === "submit" || action === "save_published") && (!complete || !acknowledged)) return;
    operation.current = true; setBusy(action === "save_draft" ? "autosave" : "explicit"); setMessage("");
    const snapshot = latest.current;
    const revision = persisted.current.revision;
    attempted.current = { action, fields: snapshot, revision };
    try {
      const result = await api(path, { action, revision, ...(action === "delete_draft" ? {} : { fields: snapshot }), ...(["submit", "save_published"].includes(action) ? { acknowledged: true } : {}) });
      if (action === "delete_draft") { leaving.current = true; window.location.assign(listPath); return; }
      adopt(result.request); setProblem(null); attempted.current = null;
      if (action !== "save_draft") setAcknowledged(false);
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : 0;
      setProblem({ kind: status === 409 ? "conflict" : [401, 403].includes(status) ? "denied" : "ambiguous", message: failureMessage(failure) });
    } finally { operation.current = false; setBusy(null); }
  }
  useEffect(() => {
    if (published || !dirty || busy || problem || !withinLimits) return;
    const timer = window.setTimeout(() => { void save("save_draft"); }, 750);
    return () => window.clearTimeout(timer);
    // save reads the current refs; rescheduling follows observable editor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, published, dirty, busy, problem, withinLimits]);
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
        adopt(remote); setAcknowledged(false); attempted.current = null; setProblem(null); setMessage("The saved version confirms your change succeeded.");
      } else if (remote.revision === persisted.current.revision && sameFields(remote.fields, persisted.current.fields)) {
        setProblem({ kind: "retry", message: "The saved version is unchanged. Your local text is preserved; retry explicitly when ready." });
      } else setProblem({ kind: "conflict", message: "A newer version is saved. Your local text is preserved. Copy it if needed, then reload the saved version to continue." });
    } catch (failure) { setProblem({ kind: "ambiguous", message: failureMessage(failure) }); }
    finally { operation.current = false; setBusy(null); }
  }
  async function reloadSaved() {
    if (operation.current || !window.confirm("Discard your local edits and load the saved version?")) return;
    operation.current = true; setBusy("explicit");
    try {
      const remote: FeatureRequest = (await api(path)).request;
      adopt(remote); latest.current = remote.fields; setFields(remote.fields); setProblem(null); setAcknowledged(false); attempted.current = null; setMessage("");
    } catch (failure) { setProblem({ kind: "denied", message: failureMessage(failure) }); }
    finally { operation.current = false; setBusy(null); }
  }
  async function applyProposal(turn: ChatTurn) {
    if (!turn.proposal || operation.current || problem && problem.kind !== "retry") return false;
    if (persisted.current.revision !== turn.base_revision || !sameFields(latest.current, turn.input_fields)) return false;
    const remote: FeatureRequest = (await api(path)).request;
    if (remote.revision !== turn.base_revision) {
      setProblem({ kind: "conflict", message: "Another editor saved a newer task. Your text is preserved; reload the saved version before applying a fresh proposal." });
      return false;
    }
    // Repeat after the asynchronous read: typing/autosave may have changed the
    // editor while the freshness check was in flight.
    if (persisted.current.revision !== turn.base_revision || !sameFields(latest.current, turn.input_fields)) return false;
    latest.current = { ...turn.proposal }; setFields(latest.current); setAcknowledged(false);
    setMessage("AI proposal applied to your editor. Review it before publishing."); setTab("task");
    window.requestAnimationFrame(() => document.getElementById("request-title")?.focus());
    return true;
  }
  function changeTab(next: "task" | "chat") { setTab(next); document.getElementById(next + "-tab")?.focus(); }
  const blocked = Boolean(problem && problem.kind !== "retry");
  return <section className="stack request-page">
    <a href={listPath}>Back to requests</a><h1>{stored.fields.title || "Untitled draft"}</h1><RequestMetadata item={stored} />
    <Notice>{busy ? "Saving…" : problem ? "Save failed — local text preserved" : dirty ? "Unsaved changes" : "Saved"}</Notice>
    {problem && <div className="stack"><Notice danger>{problem.message}</Notice><div className="actions">
      {problem.kind === "ambiguous" && <Button className="secondary" disabled={Boolean(busy)} onClick={reconcile}>Check saved version</Button>}
      {problem.kind === "retry" && !published && <Button disabled={Boolean(busy)} onClick={() => save("save_draft")}>Retry draft save</Button>}
      <Button className="secondary" disabled={Boolean(busy)} onClick={reloadSaved}>Reload saved version and discard edits</Button>
    </div></div>}
    {message && <Notice>{message}</Notice>}
    {!withinLimits && <Notice danger>Title is limited to 160 characters and description to 24,000. Your local text is preserved; shorten it before saving.</Notice>}
    <div className="workspace-tabs" role="tablist" aria-label="Task and chat">
      {(["task", "chat"] as const).map(name => <button key={name} id={name + "-tab"} className="button secondary" role="tab" aria-controls={name + "-panel"} aria-selected={tab === name} tabIndex={tab === name ? 0 : -1} onClick={() => changeTab(name)} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); changeTab(event.key === "Home" ? "task" : event.key === "End" ? "chat" : tab === "task" ? "chat" : "task"); } }}>{name === "task" ? "Task" : "Chat"}</button>)}
    </div>
    <div className="task-chat-grid">
    <div id="task-panel" className={`task-panel ${tab !== "task" ? "mobile-hidden" : ""}`}>
    <form className="card stack" aria-label="Request editor" onSubmit={event => { event.preventDefault(); void save(published ? "save_published" : "submit"); }} aria-busy={Boolean(busy)}>
      {requestFields.map(field => field.key === "title" ? <Field key={field.key} id={`request-${field.key}`} label={field.label} maxLength={field.max * 2} value={fields[field.key]} disabled={busy === "explicit"} onChange={event => edit(field.key, event.target.value)} /> : <TextareaField key={field.key} id={`request-${field.key}`} label={field.label} maxLength={field.max * 2} value={fields[field.key]} disabled={busy === "explicit"} onChange={event => edit(field.key, event.target.value)} />)}
      <p className="hint">{published ? "Published edits are saved only when you choose Save changes." : "Drafts autosave after a short pause. Only you can read this draft."} Title and description need content to publish. Section headings are optional.</p>
      <label className="checkbox-field"><input type="checkbox" checked={acknowledged} disabled={Boolean(busy)} onChange={event => setAcknowledged(event.target.checked)} />I acknowledge the assumptions and unresolved questions.</label>
      <div className="actions"><Button disabled={Boolean(busy) || blocked || !complete || !acknowledged || (published ? !dirty : dirty)}>{published ? "Save changes" : "Submit request"}</Button>
        {!published && <Button type="button" className="secondary" disabled={Boolean(busy) || blocked} onClick={() => { if (window.confirm("Delete this private draft? This cannot be undone.")) void save("delete_draft"); }}>Delete draft</Button>}
      </div>
    </form>
    </div>
    <div id="chat-panel" className={tab !== "chat" ? "mobile-hidden" : ""}>
      <ChatPanel path={path + "/chat"} fields={fields} revision={stored.revision} canSend={!busy && !blocked && withinLimits && (published || !dirty)} canApply={!busy && !blocked && withinLimits} onApply={applyProposal} />
    </div>
    </div>
  </section>;
}
