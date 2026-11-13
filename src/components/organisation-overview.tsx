"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ticketStatuses } from "@/delivery";
import { derivedStatuses, localDay, requestsHref, type OrganisationOverview, type RequestFilters } from "@/overview";
import { api, ApiError, failureMessage } from "./http";
import { OrganisationTabs } from "./organisation-tabs";
import { BackLink, Button, Notice } from "./ui";

type Load = { open: number; overdue: number; high: number };
type Filters = Partial<RequestFilters>;

/** A count that links to the matching Requests view, or plain text when it is zero. */
function Count({ value, href, label, children }: { value: number; href: string; label?: string; children: ReactNode }) {
  if (value === 0) return <span className="overview-zero">{children}</span>;
  return (
    <a href={href} aria-label={label}>
      {children}
    </a>
  );
}

const statusTiles: { key: keyof OrganisationOverview["totals"]; label: string; tone?: "danger" }[] = [
  ...(Object.entries(ticketStatuses) as [keyof typeof ticketStatuses, string][]).map(([key, label]) => ({
    key,
    label,
  })),
  { key: "overdue", label: derivedStatuses.overdue, tone: "danger" },
  { key: "due_soon", label: derivedStatuses.due_soon },
];

/** Read-only counts for one organisation, each leading to the matching tickets. */
export function OrganisationOverviewPage({ organisationId }: { organisationId: string }) {
  const [overview, setOverview] = useState<OrganisationOverview | null>(null);
  const [organisation, setOrganisation] = useState("");
  const [failure, setFailure] = useState<{ message: string; status: number | null } | null>(null);
  const [reload, setReload] = useState(0);
  const href = (filters: Filters) => requestsHref(organisationId, filters);

  useEffect(() => {
    let active = true;
    // The name is decoration: only the overview's own answer decides what the page reports.
    api(`/api/organisations/${organisationId}`)
      .then(org => {
        if (active) setOrganisation(org.organisation.name);
      })
      .catch(() => {});
    api(`/api/organisations/${organisationId}/overview?day=${localDay()}`)
      .then(result => {
        if (!active) return;
        setOverview(result.overview);
        setFailure(null);
      })
      .catch(error => {
        if (!active) return;
        setOverview(null);
        setFailure({ message: failureMessage(error), status: error instanceof ApiError ? error.status : null });
      });
    return () => {
      active = false;
    };
  }, [organisationId, reload]);

  function retry() {
    setFailure(null);
    setReload(n => n + 1);
  }

  const totals = overview?.totals;
  // Every published ticket has exactly one delivery status, so these sum to the published total.
  const published = totals
    ? (Object.keys(ticketStatuses) as (keyof typeof ticketStatuses)[]).some(key => totals[key] > 0)
    : false;

  function loadRow(name: string, load: Load, assignee: string, key: string, role?: string) {
    return (
      <tr key={key}>
        <th scope="row">{name}</th>
        <td>{role ?? "—"}</td>
        <td>
          <Count value={load.open} href={href({ status: "open", assignee })} label={`${name}: ${load.open} open`}>
            {load.open}
          </Count>
        </td>
        <td>
          <Count
            value={load.overdue}
            href={href({ status: "overdue", assignee })}
            label={`${name}: ${load.overdue} overdue`}
          >
            {load.overdue}
          </Count>
        </td>
        <td>
          <Count
            value={load.high}
            href={href({ status: "open", priority: "high", assignee })}
            label={`${name}: ${load.high} high priority`}
          >
            {load.high}
          </Count>
        </td>
      </tr>
    );
  }

  return (
    <section className="stack">
      <BackLink href="/workspace">Back to workspace</BackLink>
      <div>
        <p className="eyebrow">{organisation || "Organisation"}</p>
        <div className="page-heading requests-heading">
          <h1>Overview</h1>
        </div>
      </div>
      <OrganisationTabs organisationId={organisationId} current="overview" />
      {failure?.status === 401 ? null : failure ? (
        // An ended session (401) is reported once, by the shared session banner.
        <div className="stack">
          <Notice danger>{failure.message}</Notice>
          {failure.status !== 403 && (
            <div>
              <Button className="secondary" onClick={retry}>
                Try again
              </Button>
            </div>
          )}
        </div>
      ) : !overview || !totals ? (
        <Notice>Loading overview…</Notice>
      ) : (
        <>
          <section className="card overview-mine" aria-labelledby="overview-mine">
            <h2 id="overview-mine">Your work</h2>
            <p>
              Assigned to you:{" "}
              <Count value={overview.mine.open} href={href({ status: "open", assignee: "me" })}>
                {overview.mine.open} open
              </Count>
              {" · "}
              <Count value={overview.mine.overdue} href={href({ status: "overdue", assignee: "me" })}>
                {overview.mine.overdue} overdue
              </Count>
            </p>
            {overview.mine.drafts !== undefined && (
              <p>
                Your private drafts:{" "}
                <Count
                  value={overview.mine.drafts}
                  href={href({ status: "draft" })}
                  label={`${overview.mine.drafts} private drafts`}
                >
                  {overview.mine.drafts}
                </Count>
              </p>
            )}
          </section>
          {!published ? (
            <div className="card">
              {overview.mine.drafts !== undefined ? (
                <p className="muted">
                  No published tickets yet. Select <strong>New task</strong> on <a href={href({})}>Requests</a> to draft
                  one; counts appear here once tickets are published.
                </p>
              ) : (
                <p className="muted">
                  No published tickets yet. Counts appear here once a Product Manager publishes tickets on{" "}
                  <a href={href({})}>Requests</a>.
                </p>
              )}
            </div>
          ) : (
            <>
              <section className="stack overview-section" aria-labelledby="overview-status">
                <h2 id="overview-status">Tickets by status</h2>
                <ul className="overview-tiles">
                  {statusTiles.map(tile => (
                    <li key={tile.key} className={`card overview-tile ${tile.tone ?? ""}`}>
                      <Count value={totals[tile.key]} href={href({ status: tile.key })}>
                        <span className="overview-tile-value">{totals[tile.key]}</span>{" "}
                        <span className="overview-tile-label">{tile.label}</span>
                      </Count>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="stack overview-section" aria-labelledby="overview-workload">
                <h2 id="overview-workload">Workload</h2>
                <p className="muted">
                  Open tickets on each member&apos;s list. A ticket shared by several assignees appears in each of their
                  rows, so the rows are not added up.
                </p>
                <div className="card requests-table-scroll" role="region" aria-label="Workload" tabIndex={0}>
                  <table className="requests-table overview-table">
                    <thead>
                      <tr>
                        <th scope="col">Member</th>
                        <th scope="col">Role</th>
                        <th scope="col">Open</th>
                        <th scope="col">Overdue</th>
                        <th scope="col">High priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.workload.members.map(member =>
                        loadRow(member.username, member, member.user_id, member.user_id, member.app_role),
                      )}
                      {loadRow("Unassigned", overview.workload.unassigned, "unassigned", "unassigned")}
                    </tbody>
                  </table>
                </div>
                {overview.workload.member_total > overview.workload.members.length && (
                  <p className="muted">
                    Showing {overview.workload.members.length} of {overview.workload.member_total} members.
                  </p>
                )}
              </section>
            </>
          )}
        </>
      )}
    </section>
  );
}
