# Whole-ticket Publish and Update

Status: approved by the user on 2026-11-08. Supersedes the layout spec's
independent delivery save controls and the earlier autosave proposal.

## Behaviour

- Private drafts autosave title, description and delivery details together after
  a short pause. They remain private until Publish.
- One primary ticket action: Publish for a draft, Update for a published ticket.
  Each writes the entire ticket, including pending delivery details, atomically.
  Published edits remain local until Update; do not silently publish metadata.
- Remove Save delivery details and routine Reload delivery details. Show recovery
  actions only on errors/conflicts. Retain confirmed Delete draft as a secondary
  destructive action and copy link. Follow-up approved by the user: remove the
  explanatory paragraph and acknowledgement checkbox. Publish/Update are the
  explicit confirmation; retain the legacy HTTP/RPC acknowledged flag for
  compatibility, sent only by those deliberate actions. No checkbox gating.
- Keep all author/assignee/reader permissions, content limits, required first
  publication due date, private draft access and explicit AI suggestion acceptance.
  An assigned reader uses Update to save permitted status edits.
- One truthful author save status and departure guard cover all ticket fields.
  Preserve edits on conflict/failure. Check ambiguous results before retrying;
  matching text alone cannot establish success if delivery details differ.
- A transaction must check content and delivery revisions and roll back all
  changes if either is stale or any content/delivery validation fails.

## Module and testing interfaces

Lift author delivery state into the existing editor. Reuse shared delivery field
UI for readers; keep assignee status-only writes at the existing delivery seam.
Add a session-authorized transactional RPC composing existing validated writes;
keep old HTTP/RPC contracts compatible for other callers.

Use existing public HTTP/session-RPC integration tests for atomic draft/save,
publication/update, rollback, revision conflicts, unauthorized/cross-org writes,
invalid assignments and legacy HTTP/RPC acknowledgement validation. Browser journeys verify private
draft persistence, whole-ticket Publish/Update, metadata not saved before Update,
navigation protection, errors/lost responses, readers and layout. Deterministic
local provider only. TDD; security preflight/post-review and one independent code
review. Update guides and one sanitized session summary. No live SoC/deployment.

## Follow-up: actionable publication validation

User reported Publish disabled with a wait cursor after removing helper copy.
Bug fix within existing publication/browser seams: keep Publish clickable while
idle, use native required-field validation for title/description/first-publication
due date (including form-associated controls above Description), and report
whitespace-only content on attempted publication. Keep existing server validation,
permissions and explicit action semantics. Reserve the wait cursor for genuinely
busy forms; disabled idle controls use not-allowed. Draft autosave still permits
incomplete content. Published Update remains disabled while unchanged.

## Follow-up: optional due date

User explicitly approved publishing without a due date. Remove first-publication
and published-date-clearing requirements in UI and storage. Blank due dates stay
null and display Unscheduled; supplied dates still require valid calendar values.
Title (1–160 code points after nonblank validation) and Description (1–24,000)
remain required for publication/Update. Priority/status retain defaults; zero
assignees is allowed. Preserve all author/member/assignee permissions and atomic
revision checks. Use existing HTTP/RPC and browser seams to verify publishing
without a date, adding/removing a published date and invalid supplied dates.
