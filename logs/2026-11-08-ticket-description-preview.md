# Session summary: 2026-11-08 / Ticket description preview

- Request: add Write and Preview tabs to the ticket description editor. The
  feature spec records the requested behavior at the existing ticket-layout
  browser seam.
- Write remains the default. Preview renders live text with the reader's
  Markdown renderer. The editor keeps the textarea mounted and preserves draft
  autosave and explicit Publish/Update. An empty description returns focus to
  Write on attempted publication. Updated the user guide.
- RED: the extended Chromium journey failed because the Write tab was absent.
  Follow-up runs exposed an ambiguous accessible name for the description and
  an overly broad alert locator. Gave the tab group a distinct name and scoped
  the assertion to the editor form.
- GREEN: the ticket layout browser suite passed all four journeys on the
  disposable local stack. It covers keyboard switching and panel focus, empty
  preview validation, rendered headings and lists, source preservation,
  publication from Preview, and reader parity. Checked mobile overflow and
  inspected author and reader screenshots.
- `npm run verify` passed lint, type checking, 74 tests and the production build.
  The ordinary test command skipped 56 database tests. No live SoC calls.
- One independent code/architecture reviewer approved the working diff with no
  blocking findings. The reviewer checked Update by inspection; the new browser
  assertions exercise Publish. Resource usage was not captured.

## Bold formatting follow-up

- The user reported that Preview displayed double asterisks around bold text.
  Added strong emphasis for paired `**` markers in the shared renderer. Fenced
  code and untrusted HTML-like text stay literal. Updated the feature spec and
  user guide.
- RED reproduced the missing bold heading in Chromium. The first post-change
  run passed Preview assertions but matched an activity row in the reader
  assertion. Scoped it to the description item. All four layout browser tests
  then passed. `npm run verify` passed with 74 tests and 56 database tests skipped.
- Security preflight and post-change review checked the untrusted text path,
  fixed React element, and forward scan. Independent code review approved the
  follow-up. No live provider calls or recorded resource measurements.

## Italic formatting follow-up

- The user requested both `*italic*` and `_italic_`. Extended the shared
  emphasis renderer, the existing author/reader browser journey, and the user
  guide. The browser journey covers nested emphasis, literal fenced code, and
  HTML-like text inside both bold and italics.
- RED reproduced the missing italic element. Fixed escaped delimiter runs
  after a browser failure and supplementary Unicode word characters after
  independent review. All four layout browser tests passed on the final diff.
  `npm run verify` passed with 74 tests and 56 database tests skipped.
- Independent code and security reviewers approved the final diff. Security
  checked bounded parsing and the fixed React text-rendering path before and
  after the change. No live provider calls or recorded resource measurements.

## Always-visible ticket metadata and save timestamp

- The user requested a dated Last autosaved status below an always-visible
  About this ticket section. Moved the author status into the metadata and
  made the section static on author and reader pages. Published and older
  drafts with unknown autosave history use Last saved; new drafts wait for
  their first autosave. Updated the visibility spec and guides.
- RED reproduced the absent static section. All 41 browser journeys passed
  for the initial layout. Independent review found that delivery-only changes
  could advance `updated_at` and mislabel an autosave. A request integration
  regression then failed on the missing distinct timestamp.
- Added and applied the local additive migration. The timestamp follows draft
  content revisions, survives delivery-only updates, and clears on publication.
  The final diff passed 12 request integration tests, all four layout browser
  journeys, and `npm run verify` with 74 tests and 56 database tests skipped.
- Independent code re-review and security preflight/post-review approved the
  final changes. The direct reader test confirms draft privacy and a null
  timestamp after publication. No live provider calls or recorded resource
  measurements.

## Site-wide back links

- The user requested the Back to requests arrow on all page-level back links.
  Standardized Back to requests, Back to workspace, and Back to sign in with a
  shared `BackLink`. Existing navigation modes preserve the editor's unsaved
  work protection. Updated the shared UI guide and feature spec.
- RED reproduced missing arrows on the workspace and sign-in back links. All
  five targeted Chromium journeys passed after the change, including keyboard
  navigation and unsaved work protection. `npm run verify` passed with 74 tests
  and 56 database tests skipped.
- Independent code review approved the change. No resource measurements or
  live provider calls were recorded.

## Inline assignee count

- The user requested moving the selection count beside the editable Assignees
  label and removing the help line beneath the picker. The count is also the
  combobox's accessible description. Updated the picker spec and user guide.
- RED reproduced missing inline counts at zero and five. Both focused browser
  journeys passed after the change, including selection, removal, and the cap.
  Checked the mobile screenshot. `npm run verify` passed with 74 tests and 56
  database tests skipped. Independent code review approved the change.

## AI response timeout

- The user requested a 90-second SoC deadline and the notice “AI response timed
  out after 90 seconds.” The browser now waits up to 110 seconds. Earlier
  timeout notices use their recorded duration in whole seconds. Existing
  120-second worker leases and explicit retry behavior still apply.
- RED reproduced the former 60-second provider configuration and the old
  browser copy. The final diff passed 15 chat integration tests, two focused
  Chromium journeys, and `npm run verify` with 74 tests and 56 database tests
  skipped in the ordinary test command.
- Independent code and security reviewers approved the change. Security
  preflight and post-review checked the fetch/body deadline, admission and
  reconciliation. Tests used local fixtures and a deterministic AI adapter.

## Simplified AI panel

- Removed Refresh chat and the three preset writing actions at the user's
  request, including their handlers, styling, prompts and preset-only server
  proposal processing. Private Ask AI, draft generation, Leave undecided and
  explicit suggestion review remain available. Historical diagnostics still load.
- Lost sends now trigger an authorized read by turn key. The panel offers an
  explicit resend when the turn is absent. Reopening can recover failed reads.
  Review found a stale resend candidate could block recovery after a failed poll
  with another active turn. The expanded browser regression reproduced that
  failure. Clearing the candidate on read failure fixed it.
- The initial panel regression failed before removal. Thirteen chat integration,
  16 request browser and four layout browser tests passed. Three focused
  recovery browser tests passed after the poll fix. `npm run verify` passed with
  74 tests and 54 database tests skipped in ordinary Vitest.
- Independent code and security review approved the final diff. Tests used the
  local stack and deterministic AI adapter. Resource totals were not captured.
