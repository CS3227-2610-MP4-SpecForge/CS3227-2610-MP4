# Ticket delivery MVP

Status: approved by the user on 2026-11-08 through approval of the research
recommendation and its proposed defaults. This amends the initial exclusions
for assignments, delivery status, comments and history. Implemented and independently
code/security reviewed for local use; hosted release remains separate. See the
session summary for actual check evidence.

## Behaviour and acceptance

- Keep title/Markdown description and private AI discussion. Store delivery
  metadata separately; AI cannot change it. Drafts remain author-private.
- Date-only due date: optional in drafts, required for first publication.
  Existing published tickets retain an unset deadline until the author schedules
  them; do not invent deadlines during migration. Show due-today/overdue only
  for active published work using the viewer's local calendar day.
- Assign zero to five distinct current members, either application role.
  Selecting a member grants no draft/chat access. Remove active assignments on
  membership departure, retaining assignment-change history; rejoining does not
  restore assignments automatically.
- Delivery statuses: to_do, in_progress, in_review, done, cancelled. First
  publication starts at to_do; published tickets can reopen. Priority:
  low, medium (default), high, urgent.
- The original author, while a current member, alone edits requirements, due
  date, priority and assignments. The author and current assignees can update
  published delivery status. Admin status grants no extra ticket powers.
- All current members can read/comment on published tickets. Comments are
  append-only plain text (1–4000 Unicode code points), safely rendered. No
  mentions, attachments, edit/delete or notifications in this slice.
- Append immutable actor/time activity for delivery changes and publication;
  title/description edits record an event without storing old sensitive text.
  Shared activity never exposes draft events or private AI content. Read comments
  and activity in bounded pages (50, with explicit load-more); preserve history
  after membership departure. Bound comment creation to 20/member/minute/org.
- Stable organisation-scoped SF-number reference, copy ticket link. Assign
  numbers atomically and preserve existing IDs; gaps are allowed.
- List shows metadata and supports title/reference search, status, priority,
  member, assigned-to-me, unassigned and overdue filters, due-date/recent-update
  sorting. Paginate storage reads so filtering does not silently miss tickets
  beyond the former 100-item limit. Provide loading/error/empty states.
- Metadata changes use conditional delivery revisions independent of content
  revisions, preserving autosave/chat contracts. Stale changes return conflict,
  preserve editor input and require reload. Status-only actions cannot smuggle
  author-only changes. Failed/ambiguous comment writes retain text and use an
  idempotency key for safe explicit retry.

## Modules and approved testing interfaces

Reuse session-bound authentication, origin checks, HTTP error handling and shared
UI/theme. A delivery module owns strict HTTP input/output and client types;
PostgreSQL RPCs/RLS enforce current verified membership, authorship, assignment,
privacy, bounds and atomic organisation-first locking even when bypassing HTTP.
Member picker reveals only current-member account IDs/roles, not emails or a
global directory, and is available to current organisation members.

Use the existing approved HTTP, real local Supabase RPC/RLS and browser seams:
validate dates/caps/strict actions; draft/chat privacy; PM/Developer/admin/outsider
permission matrix; cross-org substitutions; direct writes denied; membership
removal/races; concurrent assignments/status/publication; stale revisions;
comment retry/paging/throttling/safe rendering; list filtering/paging; migration
preservation; browser author/assignee/reader journeys and responsive keyboard UI.
Routine tests use no live SoC calls. Run documented project checks and independent
code/architecture plus security reviews at completion.

## Exclusions

Kanban, notifications, subtasks/dependencies, projects/epics/sprints, custom fields
or workflows, full content diff history, attachments, time tracking, recurring
tasks, integrations and changes to the partner's Developer AI.
