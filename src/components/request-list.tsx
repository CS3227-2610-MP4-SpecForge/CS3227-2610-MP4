"use client";
import { useEffect, useRef, useState } from "react";
import { api, failureMessage } from "./http";
import { BackLink, Button, Notice, Pill } from "./ui";
import { deadlineLabel, localDay, ticketPriorities, ticketStatuses, type TicketMember } from "@/delivery";
import { PriorityPill, StatusPill } from "./ticket-pills";
import { TicketMembers } from "./ticket-members";
import type { TicketRead } from "@/requests";
import { assigneeUsernameLabel } from "@/usernames";

export function RequestList({ organisationId }: { organisationId: string }) {
  const [items, setItems] = useState<TicketRead[]>([]);
  const [organisation, setOrganisation] = useState("");
  const [role, setRole] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [members, setMembers] = useState<TicketMember[]>([]);
  const [filters, setFilters] = useState({ search: "", status: "", priority: "", assignee: "", sort: "updated", overdue: false });
  const [query, setQuery] = useState(""); const [nextOffset, setNextOffset] = useState<number | null>(null);
  const creationKey = useRef<string | null>(null);
  const path = `/api/organisations/${organisationId}/requests`;
  useEffect(() => {
    let active = true;
    Promise.all([api(path + query), api("/api/account"), api(`/api/organisations/${organisationId}`)]).then(([list, account, org]) => {
      if (active) { setItems(list.requests); setNextOffset(list.nextOffset); setRole(account.account.role); setOrganisation(org.organisation.name); setError(""); }
    }).catch(failure => { if (active) setError(failureMessage(failure)); }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [path, organisationId, reload, query]);
  function applyFilters() {
    if (pending) return;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, String(value));
    if (filters.overdue) params.set("today", localDay());
    setLoaded(false); setQuery("?" + params.toString()); setReload(n => n + 1);
  }
  async function more() {
    if (pending || nextOffset === null) return; setPending(true);
    try {
      const params = new URLSearchParams(query); params.set("offset", String(nextOffset));
      const result = await api(path + "?" + params.toString());
      setItems(current => [...current, ...result.requests.filter((item: TicketRead) => !current.some(old => old.id === item.id))]); setNextOffset(result.nextOffset); setError("");
    } catch (failure) { setError(failureMessage(failure)); } finally { setPending(false); }
  }
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
    <BackLink href="/workspace" fullPage>Back to workspace</BackLink>
    <div className="page-heading"><div><p className="eyebrow">{organisation || "Organisation"}</p><h1>Requests</h1><p className="muted">Submitted requests are shared with your team. Drafts are private to their author.</p></div>{role === "PM" && <Button disabled={pending} onClick={create}>{pending ? "Creating…" : "New draft"}</Button>}</div>
    {error && <Notice danger>{error} If draft creation failed, retrying uses the same creation key.</Notice>}
    <form className="card stack" aria-label="Ticket filters" onSubmit={event => { event.preventDefault(); applyFilters(); }}>
      <div className="ticket-filters">
        <div className="field"><label htmlFor="ticket-search">Search tickets</label><input id="ticket-search" maxLength={160} value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} placeholder="Search by title" /></div>
        <div className="field"><label htmlFor="filter-status">Status filter</label><select id="filter-status" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option><option value="draft">Private drafts</option>{Object.entries(ticketStatuses).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="field"><label htmlFor="filter-priority">Priority filter</label><select id="filter-priority" value={filters.priority} onChange={event => setFilters({ ...filters, priority: event.target.value })}><option value="">All priorities</option>{Object.entries(ticketPriorities).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="field"><label htmlFor="filter-assignee">Assignee filter</label><select id="filter-assignee" value={filters.assignee} onChange={event => setFilters({ ...filters, assignee: event.target.value })}><option value="">Anyone</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option>{members.map(member => <option key={member.user_id} value={member.user_id}>{member.username} ({member.app_role})</option>)}</select></div>
        <div className="field"><label htmlFor="filter-sort">Sort tickets</label><select id="filter-sort" value={filters.sort} onChange={event => setFilters({ ...filters, sort: event.target.value })}><option value="updated">Recently updated</option><option value="due">Due date</option></select></div>
      </div>
      <label className="checkbox-field"><input type="checkbox" checked={filters.overdue} onChange={event => setFilters({ ...filters, overdue: event.target.checked })} />Overdue only</label>
      <div className="actions"><Button disabled={pending}>Apply filters</Button></div>
      <TicketMembers organisationId={organisationId} onMembers={setMembers} />
    </form>
    {!loaded ? <Notice>Loading requests…</Notice> : <>
      <Button className="secondary" disabled={pending} onClick={() => { setError(""); setReload(n => n + 1); }}>Refresh requests</Button>
      {!error && items.length === 0 && <div className="card"><p className="muted">{query ? "No tickets match these filters." : "No requests yet."}</p></div>}
      <ul className="organisation-list">{items.map(item => <li className="card request-summary" key={item.id}><div className="ticket-badges">{item.submitted_at ? <StatusPill value={item.status} /> : <Pill>Private draft</Pill>}<PriorityPill value={item.priority} /><span>{deadlineLabel(item)}</span></div><h2><a href={`/organisations/${organisationId}/requests/${item.id}`}>{item.fields.title || "Untitled draft"}</a></h2><p className="muted">Assignees: {assigneeUsernameLabel(item.assignee_usernames)}</p><p className="muted">Author: {item.author_username}</p><p className="muted">Last modified: {new Date(item.updated_at).toLocaleString()}</p></li>)}</ul>
      {nextOffset !== null && <Button className="secondary" disabled={pending} onClick={more}>Load more tickets</Button>}
    </>}
  </section>;
}
