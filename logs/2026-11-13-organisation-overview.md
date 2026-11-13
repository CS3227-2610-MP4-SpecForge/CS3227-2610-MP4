# 2026-11-13: Organisation overview

- Changes: Added an Overview tab, which workspace cards now open
  ([spec](../workflow/specs/2026-11-13-organisation-overview.md)).
  - **Counts:** the tab shows the viewer's assigned and overdue counts, per-status
    totals with Overdue and Due in the next 7 days, and per-member workload. Every
    nonzero count links to a filtered Requests view.
  - **Database:** `organisation_overview` and `list_ticket_page` share the open,
    overdue and due-soon predicates and the viewer-day validation. Totals count
    each ticket once; workload rows count a ticket once per assignee and are
    never summed.
  - **Requests:** filters now live in the URL and survive reload, which
    deliberately replaces the earlier reload-resets rule. The status filter gains
    Open, Overdue and Due in the next 7 days.
  - **Guides:** the User Guide, Developer Guide, Acceptance Index and the new
    screenshot are updated.
  - **AI usage card:** the admin's organisation AI usage bar in Manage is now
    a white stat card with a headline figure, separate from the Invite Member
    panel. Its caption text and meter are unchanged.
- Validation: `npm run verify` passed (313 unit and component tests, build), and
  `npm run test:integration` passed 104/104, including the new overview suite.
  The full `npm run test:e2e` run on port 3001 passed 58/58. After a final CSS
  tile-width change, only the overview and delivery pill journeys were rerun
  (both passed).
- Review:
  - **Security preflight:** added the `authenticated`-only grant, viewer-day
    bounds, a 100-row workload cap, aggregate-only responses and the generic
    invalid-filter notice. All are implemented and tested.
  - **Code review:** found two spec gaps (no New task pointer for PMs in the
    empty state; a 401 duplicated the session banner), a linked-assignee race that
    could undo applied filters, an invented role on a failed lookup, and unchecked
    journey setup. All are fixed with regression tests.
  - **Full browser run:** exposed a non-member race in which the organisation's
    404 could hide the permission message. The name now loads independently.
- Open: nothing has been checked on a hosted environment.
