"use client";
import { useEffect, useRef, useState } from "react";
import { api, failureMessage } from "./http";
import { Button, Notice } from "./ui";
import type { FeatureRequest } from "@/requests";

export function RequestList({ organisationId }: { organisationId: string }) {
  const [items, setItems] = useState<FeatureRequest[]>([]);
  const [organisation, setOrganisation] = useState("");
  const [role, setRole] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const creationKey = useRef<string | null>(null);
  const path = `/api/organisations/${organisationId}/requests`;
  useEffect(() => {
    let active = true;
    Promise.all([api(path), api("/api/account"), api(`/api/organisations/${organisationId}`)]).then(([list, account, org]) => {
      if (active) { setItems(list.requests); setRole(account.account.role); setOrganisation(org.organisation.name); setError(""); }
    }).catch(failure => { if (active) setError(failureMessage(failure)); }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [path, organisationId, reload]);
  async function create() {
    if (pending) return;
    setPending(true); setError("");
    creationKey.current ??= crypto.randomUUID();
    try {
      const result = await api(path, { creationKey: creationKey.current });
      // All editor entries use document navigation, so native beforeunload also
      // protects Back/Forward. Keep this consistent with the plain request links.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/organisations/${organisationId}/requests/${result.request.id}`);
    } catch (failure) { setError(failureMessage(failure)); setPending(false); }
  }
  return <section className="stack">
    <a href="/workspace">Back to workspace</a>
    <div className="page-heading"><div><p className="eyebrow">{organisation || "Organisation"}</p><h1>Requests</h1><p className="muted">Submitted requests are shared with your team. Drafts are private to their author.</p></div>{role === "PM" && <Button disabled={pending} onClick={create}>{pending ? "Creating…" : "New draft"}</Button>}</div>
    {error && <Notice danger>{error} If draft creation failed, retrying uses the same creation key.</Notice>}
    {!loaded ? <Notice>Loading requests…</Notice> : <>
      <Button className="secondary" disabled={pending} onClick={() => { setError(""); setReload(n => n + 1); }}>Refresh requests</Button>
      {!error && items.length === 0 && <div className="card"><p className="muted">No requests yet.</p></div>}
      <ul className="organisation-list">{items.map(item => <li className="card request-summary" key={item.id}><span className="badge">{item.submitted_at ? "Submitted" : "Private draft"}</span><h2><a href={`/organisations/${organisationId}/requests/${item.id}`}>{item.fields.title || "Untitled draft"}</a></h2><p className="muted">Author account: {item.author_id}</p><p className="muted">Last modified: {new Date(item.updated_at).toLocaleString()}</p></li>)}</ul>
    </>}
  </section>;
}
