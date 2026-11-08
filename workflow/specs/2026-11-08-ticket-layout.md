# Ticket layout and AI sidebar

Status: approved by the user on 2026-11-08, including hiding visible references. Implemented and independently reviewed
for local use; validation is recorded in the session summary. Delivery implementation was committed first
as `bf218cb` (`Add ticket delivery tracking and team discussion`).

## User and behaviour

Make the ticket read as one Jira-inspired work item, with AI assistance in the
right panel. Jira supports configurable field ordering; this layout follows the
user's requested arrangement rather than copying one Jira configuration.

- Compact top row: back/breadcrumb navigation, publication state and
  copy-link action. Remove the repeated large ticket-title heading.
- Do not display ticket references anywhere in the user interface, including
  the ticket page, list cards and search hints. Search hints describe title
  search. Keep existing stored references and ordinary copy-link functionality;
  hiding references requires no data migration or identifier changes.
- Main column: editable Title first, then compact delivery fields (status,
  priority, due date, assignees), then Markdown Description and existing text
  save/publication controls. Team discussion/activity stays with the ticket.
- Replace the boxed delivery sidebar with these fields beneath Title. Retain
  independent explicit delivery saving, text autosave for drafts and explicit
  published text saves. Keep truthful saving, dirty, conflict and error states.
- Right panel owns all AI UI: first-draft/rough-idea controls, Improve clarity,
  Add acceptance criteria, Find missing details, private discussion, generated
  suggestion review/accept/discard, undo and AI loading/error/retry controls.
  No AI toolbar above the main ticket. Main title/description stay visible even
  for a new ticket. AI suggestions still require existing application/freshness
  rules; moving UI does not change provider behaviour or authorization.
- AI panel open for PM authors, with a compact show/hide
  control. Collapsing preserves typed instructions, conversation and proposals.
  On narrow screens it becomes an expandable section beneath the ticket, with
  readable single-column suggestions and no horizontal overflow.
- Readers get the same field order, with the title displayed once in the title
  position. Preserve author/assignee/reader edit permissions. Private AI controls
  remain available only to the original PM author.

## Acceptance and testing interfaces

Use shared components/theme tokens and the existing request/editor/delivery/chat
modules. No database, HTTP, permission, model/prompt or quota changes.

At the existing browser seam, verify author and Developer layouts, one title,
field ordering, absence of visible ticket references, AI tools/review placement,
sidebar collapse/restore, empty draft
writing, focus/keyboard/mobile behaviour and loading/error/conflict states.
Retain the existing public HTTP/storage tests and AI freshness, explicit
application, save independence and lost-response regressions. Routine checks use
the deterministic local provider; no live SoC calls. Follow local TDD and
codebase-design guidance for implementation and independent code/architecture
review at completion. Styling/layout alone does not require security review;
reassess if data flow or permissions change.

## Exclusions and approval

No inline autosave for published text/metadata, rich-text editor, new ticket
fields, changed assignment permissions, shared AI chat, boards or notifications.
User approval covers this layout, panel default and existing testing interfaces.

Reference: https://support.atlassian.com/jira-cloud-administration/docs/configure-issue-layout
