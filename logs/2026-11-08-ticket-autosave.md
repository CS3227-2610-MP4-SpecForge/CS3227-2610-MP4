# Whole-ticket controls session

Human verification: pending.

- User clarified one whole-ticket primary action: Publish for a private draft,
  Update after publication; delivery details autosave privately with draft text.
  Removed independent author Save delivery details and routine reload controls.
- Updated and approved workflow/specs/2026-11-08-ticket-autosave.md from this
  explicit instruction, preserving existing browser/HTTP/session-RPC test seams.
- Main agent used local TDD, codebase-design and specforge-security skills.
  Independent security preflight required atomic writes, both revision checks,
  inherited permissions and full snapshot lost-response reconciliation.
- RED: new combined HTTP journey returned 400 rather than 200. Added optional
  delivery payload and authenticated save_ticket RPC composing existing validated
  writes in one transaction. Additive migration applied only to local stack.
  GREEN: 11 request integration tests passed, including rollback/stale/auth checks.
- RED: new browser journey found obsolete Save delivery details button. Lifted
  author delivery input into editor, shared its autosave/departure protection,
  and used controlled delivery fields. Publish/Update send all changes together.
- Initial browser implementation run timed out because the test acknowledged
  review before editing metadata, which correctly cleared acknowledgement.
  Corrected test order. One overlapping suite attempt found port 3001 still in
  use during cleanup; reran sequentially. No production actions.
- Security post-review approved inspected changes with no blocking findings;
  relies on reported integration/typecheck and inspected code, no redundant runs.
- Independent code review identified stale reader metadata on refresh and retry
  state disabling delivery corrections. Regression tests added; fixes/checks pending.
- Updated UserGuide/DeveloperGuide for whole-ticket controls. Prior reviewed
  layout changes were already uncommitted and preserved. No commits made here.
- Final results are recorded below. No live SoC/hosted tests,
  deployment or real data used. Coding-agent token/cache usage not captured.

## Review fixes and final checks

- Full initial browser suite passed 30/30 (3.1 minutes). Full local integration
  suite passed 49/49 (18.2 seconds). These used local fixtures/fake provider.
- Validation recovery regression first failed on disabled Due date. Changed the
  delivery disabled predicate to permit the reconciled retry state. It then
  passed, including full-ticket lost Update response confirmation.
- Reader regression initially raced initial page load and passed spuriously.
  Added an explicit initial Medium/status observation; RED then reproduced stale
  delivery fields. Added guarded adoption of newer props only when clean and
  not saving, preserving dirty status/revision. Removed duplicate regions.
- Focused rework run passed all four journeys (8.9 seconds): whole-ticket action,
  failed reader refresh, successful/dirty reader refresh, validation correction
  and lost Update response. No need to repeat unrelated browser journeys.
- Independent code reviewer approved recheck with no remaining findings.
  Security review remains approved; rework only touched reader state/retry UI.
- `npm run verify` passed: lint, generated types/TypeScript, 74 ordinary tests
  and production build. Its 51 opt-in tests were skipped as configured; the
  separate 49-test integration run above exercised the local database suite.
  `git diff --check` passed. Desktop author screenshot inspected;
  original browser suite also verified Developer/mobile layout and no overflow.

- Completed approved scope; changes remain uncommitted with the earlier layout
  edits. Local additive migration applied, hosted migration not applied.

## Follow-up: remove explanatory text and acknowledgement

- User explicitly requested removing the draft/publication hint paragraph and
  assumptions/unresolved-questions acknowledgement. Updated approved spec.
- Removed hint, checkbox, checkbox state/reset logic and Publish/Update gating.
  Deliberate Publish/Update still send the legacy HTTP/RPC compatibility flag;
  storage validation/permissions and explicit AI acceptance remain unchanged.
- Updated browser interactions and user/developer guides. Server failure copy
  no longer asks users to use a removed acknowledgement control.
- RED: whole-ticket browser journey without the checkbox interaction could not
  click disabled Publish and timed out. Added an initial editor visibility wait
  before absence checks to avoid passing those assertions during loading.
- Five focused browser journeys passed (17.0 seconds), covering absence of the
  text/checkbox, whole-ticket Publish/Update, recovery, AI acceptance and layout.
  Independent code review approved with no findings. `npm run verify` passed
  lint, typecheck, 74 ordinary tests and production build (51 opt-in tests
  skipped as configured). `git diff --check` passed. No new migration, hosted
  operation or live provider call.

## Follow-up: blocked Publish and misleading cursor

- User reported a disabled Publish with a spinning hover cursor. Read the live
  Safari ticket UI: saved private draft, nonempty title/description, empty date
  steppers and disabled Publish. Inspected CSS: all disabled buttons used wait.
  Did not alter/publish the user's ticket or copy its content into this log.
- Existing due-date/content rules silently disabled Publish after helper removal.
  Updated approved spec within the existing browser/publication seams.
- RED: existing whole-ticket browser journey with no date expected enabled
  Publish and failed on its disabled state. Changed idle Publish to allow clicks,
  added native required title/description/date validation (external fields use
  form association), retained server rules, autosave of incomplete drafts,
  conflict/busy guards and explicit publication. Whitespace shows an on-demand
  error. Disabled idle buttons use not-allowed; genuinely busy forms use wait.
- Live Safari UI after hot reload showed Publish enabled with the ticket still
  private; no user-field writes or publication were performed.
- Five focused browser journeys passed (18.7 seconds), including missing-date
  focus/validation and successful Publish/Update. Independent reviewer approved
  with no findings. `npm run verify` passed lint, typecheck, 74 ordinary tests and
  production build; 51 opt-in tests skipped as configured. `git diff --check`
  passed. No server/RPC/migration change in this fix.

## Follow-up: optional due date

- User explicitly requested publishing with no due date and asked which fields
  are mandatory. Title and Description remain nonblank/bounded; priority/status
  have defaults, assignees and due date are optional.
- Added approved-spec follow-up. RED session-RPC regression failed with deadline
  required. Added additive migration 20261108016000 removing the publication
  trigger and only the published-null-date rejection from update_delivery;
  existing identity, lock order, grants and supplied-date validation unchanged.
- Applied only to disposable local Supabase. Full local integration: 50 passed.
  Isolated all-migrations check: 1 passed, preserving historical tickets and
  allowing new unscheduled publication. No reset or hosted migration.
- Browser RED: required due date still blocked Update transition after Publish.
  Removed native date required attribute and submit date guard. Browser GREEN:
  3 focused journeys passed (7.9 seconds), covering optional publication, adding
  and clearing published date, whole-ticket saving and failure/lost-response
  recovery. Updated old date-required regression to simulate a temporary save
  failure instead; supplied invalid calendar dates remain tested in storage.
- Updated guides. Validation-only scope preserves authorization/identity/member
  controls; independent code review requested, separate security review omitted.
- Independent code reviewer approved with no findings. `npm run verify` passed
  lint, typecheck, 74 ordinary tests and production build (52 opt-in tests skipped
  as configured; separate local integration/migration results above).
  `git diff --check` passed. No live provider calls or deployment.

## Visibility banner feature

- User requested an Asana-inspired purple visibility banner with private lock
  and organisation-visible eye states, plus a consistent icon library. Discussed
  saved-vs-local edits and clarified delivery progress is distinct from privacy.
  User explicitly approved workflow/specs/2026-11-08-ticket-visibility-banner.md,
  including disabled To do for drafts and existing browser testing seams.
- Main agent used local TDD/codebase-design and dependency security guidance.
  Security preflight required official source metadata, pinned package/integrity,
  no installation scripts/runtime CDN, authorized org name as text, saved-state
  visibility and safe ambiguous publication handling.
- Verified npm metadata for lucide-react1.70.0: official lucide-icons/lucide repo,
  ISC license, compatible React peer. Installed exact version with ignore-scripts;
  added one package, npm reported 0 vulnerabilities. Lockfile retains SHA512;
  only other changes are unchanged-version optional type-peer dev flags.
- RED: browser expected visibility region, none existed. GREEN: shared banner
  displays saved private/published text, organization name comes from existing
  authorized GET, old badge removed, draft To do disabled, shared icon/purple
  theme tokens added. First focused journey passed.
- Extended browser checks cover delayed/lost publication, author/member parity,
  local published edits, long mobile names, loading/error/retry and hostile org
  name rendered as text. Initial four-test run had three pass; one assertion
  matched both the app alert and Next route announcer. Scoped alert by message.
- Inspected desktop author and mobile member screenshots against reference:
  purple top strip, consistent icons, long name wrapping and no horizontal
  overflow. Shared delivery field order and metadata details remain intact.
- Independent code review and dependency/security post-review both approved,
  no findings; reviewers were read-only and did not run redundant full suites.
- Updated UserGuide/DeveloperGuide. Full browser suite passed 35/35 (1.3 minutes),
  including all four layout/visibility journeys after the alert selector fix.
  `npm run verify` passed lint, generated types/TypeScript, 74 ordinary tests and
  production build; 52 opt-in DB/migration tests skipped as configured. No backend
  change required repeating the prior integration suite. `git diff --check` passed.
  Re-inspected private desktop Lock/disabled To do screenshot. Reviews approved.
  No server/policy/database/provider changes, live model calls or hosted actions.
  Changes remain uncommitted with the previously reviewed UI work.

## Follow-up: attached banner and back arrow

- User requested a left arrow on Back to requests, privacy banner attached to
  the ticket's left panel like the reference, and a suggestion for details.
- Suggested placing metadata below Publish/Update, before discussion, labelled
  About this ticket. Kept its current position because the request asks for a
  suggestion; no metadata relocation approved yet.
- Updated existing spec. RED layout check found no banner inside ticket card.
  Moved shared banner to first child of author/reader cards; shared responsive
  padding variable attaches its top/side edges with rounded top corners.
  Reused Lucide ArrowLeft for all ticket back links, including initial failures.
- No permission/state/dependency changes; security review not needed for this
  presentation-only follow-up. Independent code review requested. Updated guides.
- Four layout/browser journeys passed (8.0 seconds), including author/member
  placement, flush edges, arrow accessibility, mobile wrapping and publication
  recovery. Inspected desktop/private and mobile/published screenshots.
  Independent code reviewer approved with no findings. `npm run verify` passed
  lint, typecheck, 74 ordinary tests and production build (52 opt-in tests
  skipped as configured). `git diff --check` passed. No live AI/hosted actions.

## Follow-up: metadata footer

- User approved moving About this ticket to the suggested position. Updated the
  existing approved spec. RED: layout journey found no About section inside card.
- Moved native collapsed metadata details below Publish/Update for authors and
  below Refresh saved request for readers, before discussion. Removed topbar
  toggle and obsolete compact-mode branch/styles. Preserved author/timestamps;
  publication timestamp now uses the Published label.
- Updated guides and existing browser assertions for footer ordering, collapsed
  metadata, and Enter expansion/collapse. Independent reviewer approved with no
  findings; no permission/state/storage changes or security review needed.
- Three focused browser journeys passed (39.2 seconds), including footer
  ordering, reader author-data expansion and native Enter toggling. Inspected
  mobile reader screenshot. `npm run verify` passed lint, typecheck, 74 ordinary
  tests and production build (52 opt-in tests skipped as configured).
  `git diff --check` passed. No live/provider/hosted actions.

## Commit and push request

- User explicitly requested committing completed work and pushing remote main.
  Verified current branch setup, sole remote upstream points to the SpecForge
  team repository, fetched main and confirmed a fast-forward from upstream/main.
  Four existing local commits also precede this ticket UI commit on that path.
- Latest code checks/reviews are recorded above; only documentation/log updates
  followed. Stage the reviewed ticket layout, whole-ticket save/optional dates,
  visibility/icons and metadata-footer changes with their specs/guides/tests.
  Push target is HEAD:refs/heads/main, without force. No deployment requested.
