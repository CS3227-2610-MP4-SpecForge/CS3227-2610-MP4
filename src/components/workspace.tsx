"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { api, ApiError, failureMessage } from "./http";
import { Button, Field, Notice, useNotifications, useNotificationState } from "./ui";
import { Membership } from "./membership";
type Organisation = { id: string; name: string; isAdmin: boolean };
type Account = { id: string; email: string; role: "PM" | "Developer" };
export function Workspace() {
  const router = useRouter();
  const manageTrigger = useRef<HTMLButtonElement | null>(null);
  const [account, setAccount] = useState<Account>();
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [selected, setSelected] = useState<Organisation>();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [, setError] = useNotificationState(true);
  const [, setMessage] = useNotificationState(false);
  const [reload, setReload] = useState(0);
  const [membershipRevision, setMembershipRevision] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([api("/api/account"), api("/api/organisations")]).then(([identity, list]) => {
      if (active) { setAccount(identity.account); setOrganisations(list.organisations); setSelected(previous => previous ? list.organisations.find((org: Organisation) => org.id === previous.id) : undefined); setMembershipRevision(n => n + 1); }
    }).catch(failure => {
      if (!active) return;
      if (failure instanceof ApiError && failure.status === 401) router.replace("/sign-in");
      else setError(failureMessage(failure));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router, reload, setError]);
  async function create(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    setPending(true); setError(""); setMessage("");
    try {
      const result = await api("/api/organisations", { name });
      setOrganisations(previous => [...previous, result.organisation]); setSelected(result.organisation); setName("");
      setMessage("Organisation created. You are its first admin.");
    } catch (failure) { setError(failureMessage(failure)); }
    finally { setPending(false); }
  }
  async function select(id: string) {
    if (pending) return;
    setPending(true); setError(""); setMessage("");
    try { const result = await api(`/api/organisations/${id}`); setSelected(result.organisation); }
    catch (failure) { setSelected(undefined); setError(failureMessage(failure)); }
    finally { setPending(false); }
  }
  if (loading) return <Notice>Loading your workspace…</Notice>;
  return <section>
    <div className="page-heading"><div><p className="eyebrow">Your workspace</p><h1>Organisations</h1><p className="muted">Choose a team space, or create a new one.</p></div></div>

    {!account ? <Button className="secondary" onClick={() => { setError(""); setLoading(true); setReload(n => n + 1); }}>Retry loading workspace</Button> : <div className="workspace-grid">
      <div className="stack"><div className="section-title"><h2>Your organisations</h2><span className="count">{organisations.length}</span></div>
        {organisations.length === 0 ? <div className="card empty-state"><span className="empty-symbol" aria-hidden="true">◇</span><h3>Your team starts here</h3><p className="muted">Create an organisation to get started. You can belong to more than one.</p></div> : <ul className="organisation-list">{organisations.map(org => <li className="organisation-entry" key={org.id}><Link className="organisation-card" href={`/organisations/${org.id}/requests`}><span className="organisation-symbol" aria-hidden="true">{org.name.charAt(0).toUpperCase()}</span><span className="organisation-label"><strong>{org.name}</strong><span className="muted">{org.isAdmin ? "Admin" : "Member"}</span></span><span aria-hidden="true">↗</span></Link><Button className="secondary" aria-label={`Manage ${org.name}`} aria-haspopup="dialog" onClick={event => { manageTrigger.current = event.currentTarget; void select(org.id); }} disabled={pending}>Manage</Button></li>)}</ul>}
      </div>
      <aside className="card create-card"><h2>Create an organisation</h2><p className="muted">Give your team a shared home. You will become its first admin.</p><form className="stack" onSubmit={create} aria-busy={pending}><Field id="organisation-name" label="Organisation name" maxLength={80} required value={name} onChange={e => setName(e.target.value)} disabled={pending} placeholder="e.g. Team Atlas" /><Button disabled={pending}>{pending ? "Please wait…" : "Create organisation"}</Button></form></aside>
    </div>}
    {account && <div hidden={Boolean(selected)}><Membership accountId={account.id} revision={membershipRevision} onChanged={() => { setError(""); setReload(n => n + 1); }} /></div>}
    {account && selected && <ManagementDialog name={selected.name} onClose={() => { setSelected(undefined); requestAnimationFrame(() => manageTrigger.current?.focus()); }}><Membership showInbox={false} key={selected.id} selected={selected} accountId={account.id} revision={membershipRevision} onChanged={() => { setError(""); setReload(n => n + 1); }} /></ManagementDialog>}
  </section>;
}

function ManagementDialog({ name, onClose, children }: { name: string; onClose(): void; children: React.ReactNode }) {
  const { registerHost } = useNotifications();
  const ref = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    const unregister = registerHost(dialog);
    contentRef.current?.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";
    return () => { unregister(); dialog.close(); document.body.style.overflow = previousOverflow; };
  }, [registerHost]);
  return <dialog ref={ref} className="management-dialog" aria-label={`Manage ${name}`} onClose={() => { if (!ref.current?.open) onClose(); }}>
    <header className="management-dialog-toolbar"><Button className="secondary management-dialog-close" onClick={onClose} aria-label="Close management"><X className="ui-icon" aria-hidden="true" focusable="false" /></Button></header>
    <div ref={contentRef} tabIndex={-1} className="management-dialog-content" role="region" aria-label="Management content">{children}</div>
  </dialog>;
}
