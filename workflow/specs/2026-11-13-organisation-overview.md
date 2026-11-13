# Organisation overview

Status: approved by the user on 2026-11-13.

## Problem and users

Members open an organisation straight into the Requests table and cannot see at
a glance how much work is open, what is overdue or who is carrying it. Every
member (PM, Developer and admin) needs a read-only summary that leads into the
matching tickets.

## Behaviour

- **Tabs.** Organisation pages gain an `Overview | Requests` tab bar under the
  organisation name. Overview lives at `/organisations/{id}/overview`; Requests
  stays at `/organisations/{id}/requests`. Workspace organisation cards open
  Overview. The ticket editor's back link still returns to Requests.
- **Counted tickets.** Only published tickets count, except the viewer's own
  private drafts in their summary line. _Open_ means To do, In progress or In
  review. _Overdue_ means open with a due date before the viewer's local day;
  _due soon_ means open and due today or within the next six days. The client
  sends its local day, as the existing overdue filter does.
- **Your summary.** "Assigned to you: N open · M overdue". PMs also see "Your
  private drafts: K".
- **Status.** A count for each delivery status (To do, In progress, In review,
  Done, Cancelled), plus Overdue and Due in the next 7 days. These are
  organisation totals: every ticket counts exactly once, however many people
  are assigned to it.
- **Workload.** One row per current member: username, app role, open, overdue
  and open high-priority assigned tickets, then an Unassigned row for open
  tickets with no assignee. Sort by open count descending, then username. Each
  row describes that member's own list, so a ticket shared by several assignees
  appears in each of their rows. The table has no total row, and its rows are
  never summed into the organisation totals.
- **Drill-down.** Every nonzero count is a link to Requests with matching
  filters in the URL, for example `?status=overdue&assignee=<id>`. Zero counts
  are plain text.
- **URL filters on Requests.** Requests reads search, status, priority, assignee
  and sort from its URL on load. Apply filters writes them back to the URL, so a
  filtered view survives reload and can be shared. This deliberately replaces the
  earlier rule that reload returns to the default view. Invalid URL values fall
  back to the defaults with a notice rather than a broken page.
- **New status filter values.** The status filter gains Open, Overdue and Due in
  the next 7 days alongside the existing values. An assignee from the URL who is
  not in the loaded member page still shows their username in the filter.
- **States.** Loading uses the shared Notice. An organisation with no published
  tickets shows an empty state that points to Requests (and New task for PMs).
  A failed load shows an error with Try again. A 403 shows the shared
  no-permission message; a 401 is left to the session banner.

## Permissions and failures

- One read-only database function returns the whole overview in one round trip.
  It checks membership in the database, like `list_ticket_page`, and counts only
  published tickets plus the caller's own drafts. Non-members get 403; other
  members' drafts never affect any count.
- Removed members are already dropped from assignees, so they never appear in
  Workload. The overview uses no AI and writes nothing.
- Security preflight (2026-11-13) added these requirements:
  - The function is executable only by `authenticated`.
  - The viewer's day is validated like `list_ticket_page`'s and is required for
    the overview and for the overdue and due-soon filters. The dates 0001-01-01
    and 9999-12-31 must not overflow.
  - Workload is computed in one set-based query and shows at most 100 member
    rows ("Showing 100 of N members").
  - The draft figure is absent for Developers.
  - The response holds only aggregates, member ids and usernames.
  - Overdue and due-soon use the same predicates as the filters, so a count
    always equals the length of the list it links to.
  - Invalid URL filters show a generic notice that never echoes the input.

## Out of scope

Charts or trends over time, a cross-organisation "My work" page, priority
breakdown, notifications, and caching or live refresh (reloading the page
fetches fresh counts).

## Acceptance criteria

1. A member opening an organisation from the workspace lands on Overview with
   correct summary, status and workload counts for published tickets.
2. An overdue ticket with several assignees adds exactly one to the Overdue
   total and one to each assignee's Overdue cell.
3. Another member's private draft changes no count; the PM's own drafts appear
   only in their own summary line.
4. A non-member gets 403 from the overview endpoint and the page shows the
   no-permission message.
5. Selecting a nonzero count opens Requests with the matching filters selected
   and only matching tickets listed, including Overdue, Due in the next 7 days,
   Open, and member or Unassigned rows.
6. A filtered Requests view keeps its filters across reload; invalid URL values
   fall back to defaults with a notice.
7. Overview loading, empty, error and narrow-screen layouts use shared
   components and remain keyboard-accessible, including the tab bar.

## Test boundaries

- **Database** (`src/tests/overview.database.test.ts`): counts, the day
  boundaries for overdue and due soon, draft privacy, non-member denial,
  multi-assignee counting and the new status filter values in `list_ticket_page`.
- **API** (`src/tests/application.test.ts`): the overview route's validation
  and error mapping.
- **Component** (`src/components/organisation-overview.test.tsx`): rendering,
  link targets, zero counts as text, loading, empty and error states;
  `request-list.test.tsx` for URL-driven filters and invalid URL fallback.
- **Browser**: a journey from workspace to Overview, selecting Overdue, landing
  on the filtered table, then reloading.
