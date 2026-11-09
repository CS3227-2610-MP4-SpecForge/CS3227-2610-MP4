# Requests page table and filters, 2026-11-10

Working diff based on `e7f6be8`. Human verification pending.

- The user requested a compact Requests filter section, shared dropdowns, a
  five-column table and removal of redundant controls. The requested scope
  and existing browser test seam are recorded in
  `workflow/specs/2026-11-10-requests-table.md`.
- The old Refresh requests button repeated the no-store list fetch. Browser
  reload fetches the default list again, and Apply filters repeats the selected
  query. The table uses existing username and pill mappings. The guide explains
  filtering, reload and narrow-screen table scrolling.
- The updated Playwright table assertion failed against the original cards as
  expected. Both focused Requests list journeys passed after implementation.
  The wider Chromium run passed 40 of 41 tests. Its private AI discussion test
  failed on an empty editor description and passed on the focused rerun.
- The independent reviewer found lost native select typeahead. A synthetic
  Chromium check reproduced it, and the shared dropdown now matches typed label
  prefixes. The reviewer approved the updated diff. Four focused Chromium cases
  passed on the final changes, including typeahead, reload, the PM/Developer
  lifecycle and the private AI discussion rerun. Desktop and mobile screenshots
  were inspected, and table column sizing was adjusted after the first review.
- `npm run verify` passed lint, type checking, 85 tests and the production build.
  The command skipped 55 tests that require the separate database or migration
  test modes.
- One independent reviewer participated with one follow-up. Provider calls and
  deployment work were outside this change. Token and cache counts were unavailable.

The user then requested New draft on the Requests title row. An alignment check
failed on the original header, then passed at 1280 and 390 pixels after the
heading and button were grouped below the organisation name. The two focused
Chromium cases, lint and type checking passed. The reviewer approved this tweak.

The user renamed the button to New task. The guide and existing browser
locators use the new label. Four focused Chromium cases passed, covering the
header, creation and publication, creation retry, and entry to the ticket editor.

## Inline delivery edits

- The user requested Status and Priority dropdowns in the table. The owner can
  change priority, and the owner or current assignee can change published status.
  Draft status and unauthorised fields display read-only pills. The table saves
  one selected field at a time through the existing delivery endpoint, then
  reloads the active query from the first page.
- Security preflight specified revisioned single-field writes, server-side
  authorisation, and reconciliation without replay. Review found stale controls
  after list access denial. List reads now clear the affected page and identity on
  denial. The code reviewer found focus loss during saves. Compact controls now
  keep focus while blocked, and their menus reposition during table scrolling.
  Both reviewers approved the follow-up diff.
- The initial browser check timed out before the table offered inline controls.
  Later runs verified owner and assignee edits, read-only access, a row leaving
  the active filter, conflicts, lost responses, and failed reconciliation.
  Four focused Chromium cases and 10 delivery integration tests passed.
  `npm run verify` passed lint, type checking, 85 tests and the production build.

The user removed the Delivery updated notification. The table shows the saved
value after a successful edit and reports failures as before. Two focused
Chromium tests and lint for the changed files passed.

## Status sort

- Added Status to Sort tickets. The database sorts private drafts, To do, In
  progress, In review, Cancelled and Done before paging. Within each group it
  uses the existing updated-time and ID ordering.
- The new integration test first failed with `22023` for the unsupported sort.
  After applying the additive migration to local Supabase, all 11 delivery
  integration cases passed, including page boundaries, draft visibility and
  nonmember denial. The focused Chromium journey and `npm run verify` passed.
- The security reviewer approved the unchanged read permissions and the code
  reviewer approved the ordering, compatibility and coverage.
