"use client";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { api, ApiError, failureMessage } from "./http";
import { BackLink, Button, Dropdown, Notice, Pill, useNotificationState } from "./ui";
import {
  ticketPriorities,
  ticketStatuses,
  type TicketMember,
  type TicketPriority,
  type TicketStatus,
} from "@/delivery";
import { PriorityPill, StatusPill, priorityOptions, statusOptions } from "./ticket-pills";
import { TicketMembers } from "./ticket-members";
import type { TicketRead } from "@/requests";
import { assigneeUsernameLabel } from "@/usernames";
import {
  derivedStatuses,
  filterQuery,
  localDay,
  parseRequestFilters,
  requestsHref,
  uuidPattern,
  type RequestFilters,
} from "@/overview";
import { OrganisationTabs } from "./organisation-tabs";

const statusFilterOptions = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Private drafts" },
  ...Object.entries(derivedStatuses).map(([value, label]) => ({ value, label })),
  ...Object.entries(ticketStatuses).map(([value, label]) => ({ value, label })),
];
const priorityFilterOptions = [
  { value: "", label: "All priorities" },
  ...Object.entries(ticketPriorities).map(([value, label]) => ({ value, label })),
];
const sortOptions = [
  { value: "updated", label: "Recently updated" },
  { value: "due", label: "Due date" },
  { value: "status", label: "Status" },
];
type RequestPage = { requests: TicketRead[]; nextOffset: number | null };
const emptyPage: RequestPage = { requests: [], nextOffset: null };
const unrecognisedFilters = "Some filters in this link were not recognised, so defaults are shown instead.";

/** The list API query: the URL filters, plus the viewer's day where a status depends on it. */
function listQuery(filters: RequestFilters) {
  const params = new URLSearchParams(filterQuery(filters));
  if (filters.status === "overdue" || filters.status === "due_soon") params.set("today", localDay());
  const query = params.toString();
  return query ? "?" + query : "";
}

// The shared session banner reports a 401, so it does not hide the PM controls.
function accessDenied(failure: unknown) {
  return failure instanceof ApiError && failure.status === 403;
}

export function RequestList({
  organisationId,
  initialSearch = {},
}: {
  organisationId: string;
  /** The page URL's search parameters; only recognised filter values are used. */
  initialSearch?: Record<string, string | string[] | undefined>;
}) {
  const [initial] = useState(() => parseRequestFilters(initialSearch));
  const [{ requests: items, nextOffset }, setPage] = useState(emptyPage);
  const [organisation, setOrganisation] = useState("");
  const [account, setAccount] = useState<{ id: string; role: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [, setDeliveryError] = useNotificationState(true);
  const [error, setError] = useNotificationState(true);
  const [reload, setReload] = useState(0);
  const [members, setMembers] = useState<TicketMember[]>([]);
  const [filters, setFilters] = useState(initial.filters);
  const [query, setQuery] = useState(() => listQuery(initial.filters));
  // The filters behind the current list, which an asynchronous correction must start from.
  const applied = useRef(initial.filters);
  const [unrecognised, setUnrecognised] = useState(initial.invalid);
  // A member named by a link may be beyond the first page of the member directory.
  const [linkedMember, setLinkedMember] = useState<{ value: string; label: string } | null>(null);
  const creationKey = useRef<string | null>(null);
  const deliveryOperation = useRef(false);
  const busy = pending || savingDelivery;
  const path = `/api/organisations/${organisationId}/requests`;
  const assigneeOptions = [
    { value: "", label: "Anyone" },
    { value: "me", label: "Assigned to me" },
    { value: "unassigned", label: "Unassigned" },
    ...members.map(member => ({ value: member.user_id, label: `${member.username} (${member.app_role})` })),
    ...(linkedMember && !members.some(m => m.user_id === linkedMember.value) ? [linkedMember] : []),
  ];
  useEffect(() => {
    const assignee = initial.filters.assignee;
    if (!uuidPattern.test(assignee)) return;
    let active = true;
    api(`/api/organisations/${organisationId}/ticket-members?selected=${assignee}`)
      .then((result: { selected_members: TicketMember[] }) => {
        if (!active) return;
        const member = result.selected_members.find(found => found.user_id === assignee);
        if (member) return setLinkedMember({ value: assignee, label: `${member.username} (${member.app_role})` });
        // Not a current member: drop that filter rather than list nobody's tickets.
        setFilters(current => ({ ...current, assignee: current.assignee === assignee ? "" : current.assignee }));
        if (applied.current.assignee !== assignee) return;
        const next = { ...applied.current, assignee: "" };
        applied.current = next;
        setUnrecognised(true);
        setQuery(listQuery(next));
        window.history.replaceState(null, "", requestsHref(organisationId, next));
      })
      .catch(() => {
        // The filter still works by id; only its name is unknown.
        if (active) setLinkedMember({ value: assignee, label: "Linked member" });
      });
    return () => {
      active = false;
    };
  }, [initial, organisationId]);
  useEffect(() => {
    let active = true;
    Promise.all([api(path + query), api("/api/account"), api(`/api/organisations/${organisationId}`)])
      .then(([list, identity, org]) => {
        if (active) {
          setPage(list);
          setAccount(identity.account);
          setOrganisation(org.organisation.name);
          setError("");
        }
      })
      .catch(failure => {
        if (!active) return;
        setPage(emptyPage);
        if (accessDenied(failure)) setAccount(null);
        setError(failureMessage(failure));
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [path, organisationId, reload, query, setError]);
  function applyFilters() {
    if (busy || deliveryOperation.current) return;
    setDeliveryError("");
    setUnrecognised(false);
    setLoaded(false);
    applied.current = filters;
    setQuery(listQuery(filters));
    setReload(n => n + 1);
    // Keep the address in step so a reload or a shared link shows the same view.
    window.history.replaceState(null, "", requestsHref(organisationId, filters));
  }
  async function more() {
    if (busy || deliveryOperation.current || nextOffset === null) return;
    setPending(true);
    try {
      const params = new URLSearchParams(query);
      params.set("offset", String(nextOffset));
      const result: RequestPage = await api(path + "?" + params.toString());
      setPage(current => ({
        requests: [
          ...current.requests,
          ...result.requests.filter(item => !current.requests.some(old => old.id === item.id)),
        ],
        nextOffset: result.nextOffset,
      }));
      setError("");
    } catch (failure) {
      if (accessDenied(failure)) {
        setPage(emptyPage);
        setAccount(null);
      }
      setError(failureMessage(failure));
    } finally {
      setPending(false);
    }
  }
  async function saveDelivery(item: TicketRead, changes: { status: TicketStatus } | { priority: TicketPriority }) {
    if (busy || deliveryOperation.current) return;
    deliveryOperation.current = true;
    setSavingDelivery(true);
    setDeliveryError("");
    let saveError = "";
    try {
      await api(`${path}/${item.id}/delivery`, { revision: item.delivery_revision, changes });
    } catch (failure) {
      const conflict = failure instanceof ApiError && failure.status === 409;
      saveError = conflict
        ? "This task changed before your edit could be saved."
        : accessDenied(failure)
          ? "You no longer have permission to make this update."
          : "Could not confirm the update. Check the current value before trying again.";
    }
    // The update can move the row or exclude it from the active filters. Re-read
    // even on failure so a stale revision or a lost response is never replayed.
    try {
      const [list, identity] = await Promise.all([api(path + query), api("/api/account")]);
      setPage(list);
      setAccount(identity.account);
      setError("");
    } catch (failure) {
      setPage(emptyPage);
      if (accessDenied(failure)) setAccount(null);
      setError("Could not reload requests. Select Apply filters to try again.");
    } finally {
      setDeliveryError(saveError);
      deliveryOperation.current = false;
      setSavingDelivery(false);
    }
  }
  async function create() {
    if (busy || deliveryOperation.current) return;
    setPending(true);
    setError("");
    creationKey.current ??= crypto.randomUUID();
    try {
      const result = await api(path, { creationKey: creationKey.current });
      // All editor entries use document navigation, so native beforeunload also
      // protects Back/Forward. Keep this consistent with the plain request links.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/organisations/${organisationId}/requests/${result.request.id}`);
    } catch (failure) {
      setError(`${failureMessage(failure)} If draft creation failed, retrying uses the same creation key.`);
      setPending(false);
    }
  }
  return (
    <section className="stack">
      <BackLink href="/workspace" fullPage>
        Back to workspace
      </BackLink>
      <div>
        <p className="eyebrow">{organisation || "Organisation"}</p>
        <div className="page-heading requests-heading">
          <h1>Requests</h1>
          {account?.role === "PM" && (
            <Button disabled={busy} onClick={create}>
              {pending ? "Creating…" : "New task"}
            </Button>
          )}
        </div>
      </div>
      <OrganisationTabs organisationId={organisationId} current="requests" />
      {unrecognised && <Notice>{unrecognisedFilters}</Notice>}

      <form
        className="card stack request-filters"
        aria-label="Ticket filters"
        onSubmit={event => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <div className="field request-search">
          <input
            type="search"
            aria-label="Search by title"
            maxLength={160}
            value={filters.search}
            onChange={event => setFilters({ ...filters, search: event.target.value })}
            placeholder="Search by title"
          />
          <Button type="submit" className="secondary" aria-label="Apply search" disabled={busy}>
            <Search className="ui-icon" aria-hidden="true" />
          </Button>
        </div>
        <div className="ticket-filters">
          <Dropdown
            id="filter-status"
            label="Status filter"
            value={filters.status}
            options={statusFilterOptions}
            onChange={status => setFilters({ ...filters, status })}
            fitOptions
          />
          <Dropdown
            id="filter-priority"
            label="Priority filter"
            value={filters.priority}
            options={priorityFilterOptions}
            onChange={priority => setFilters({ ...filters, priority })}
            fitOptions
          />
          <Dropdown
            id="filter-assignee"
            label="Assignee filter"
            value={filters.assignee}
            options={assigneeOptions}
            onChange={assignee => setFilters({ ...filters, assignee })}
            fitOptions
          />
          <Dropdown
            id="filter-sort"
            label="Sort tickets"
            value={filters.sort}
            options={sortOptions}
            onChange={sort => setFilters({ ...filters, sort })}
            fitOptions
          />
          <Button type="submit" disabled={busy}>
            Apply filters
          </Button>
        </div>
        <TicketMembers organisationId={organisationId} onMembers={setMembers} />
      </form>
      {!loaded ? (
        <Notice>Loading requests…</Notice>
      ) : (
        <>
          {!error && items.length === 0 && (
            <div className="card">
              <p className="muted">
                {query ? (
                  "No tickets match these filters."
                ) : account?.role === "PM" ? (
                  <>
                    No tickets yet. Select <strong>New task</strong> to draft one; it stays private until you publish.
                  </>
                ) : (
                  "No published tickets yet. Tickets appear here when a Product Manager publishes them."
                )}
              </p>
            </div>
          )}
          {items.length > 0 && (
            <div className="card requests-table-scroll" role="region" aria-label="Request list" tabIndex={0}>
              <table className="requests-table" aria-label="Requests" aria-busy={savingDelivery}>
                <thead>
                  <tr>
                    <th scope="col">Title</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Assignees</th>
                    <th scope="col">Status</th>
                    <th scope="col">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const title = item.fields.title || "Untitled draft";
                    const owner = item.author_id === account?.id;
                    const canChangeStatus =
                      item.submitted_at && account && (owner || item.assignee_ids.includes(account.id));
                    return (
                      <tr key={item.id}>
                        <td>
                          <a href={`/organisations/${organisationId}/requests/${item.id}`}>{title}</a>
                        </td>
                        <td>{item.author_username}</td>
                        <td>{assigneeUsernameLabel(item.assignee_usernames)}</td>
                        <td>
                          {canChangeStatus ? (
                            <Dropdown
                              id={`status-${item.id}`}
                              label={`Status for ${title}`}
                              value={item.status}
                              options={statusOptions}
                              disabled={busy}
                              onChange={status => saveDelivery(item, { status })}
                              compact
                            />
                          ) : item.submitted_at ? (
                            <StatusPill value={item.status} />
                          ) : (
                            <Pill>Private draft</Pill>
                          )}
                        </td>
                        <td>
                          {owner ? (
                            <Dropdown
                              id={`priority-${item.id}`}
                              label={`Priority for ${title}`}
                              value={item.priority}
                              options={priorityOptions}
                              disabled={busy}
                              onChange={priority => saveDelivery(item, { priority })}
                              compact
                            />
                          ) : (
                            <PriorityPill value={item.priority} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {nextOffset !== null && (
            <Button className="secondary" disabled={busy} onClick={more}>
              Load more tickets
            </Button>
          )}
        </>
      )}
    </section>
  );
}
