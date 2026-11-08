# Ticket visibility banner

Status: approved by the user on 2026-11-08, including the delivery-status
clarification and browser testing interfaces. Implemented and independently
reviewed; validation recorded in logs/2026-11-08-ticket-autosave.md.

## Behaviour and appearance

- Follow-up approved: compact banner is attached directly to the top inside edge
  of the left ticket card, above Title; it does not span the AI column. Navigation
  stays above the card. Use shared purple
  theme tokens, pale purple background, dark purple text/icon, subtle border.
- Private/unpublished: Lock icon and “This task is private and unpublished”.
- Published: Eye icon and “This task is visible to members of the [organisation
  name] organisation”. Resolve name using existing authorized organisation GET;
  render it as text. Same banner for author, assignee and other member readers.
- Replace the small duplicate Private draft/Submitted badge with this banner;
  retain expandable Ticket details and its author/timestamps.
- Draft delivery status displays a disabled To do select; privacy is explained
  by the banner, never the delivery status. Publication unlocks status according
  to existing author/assignee permissions.
- Two persisted visibility states only. Published tickets with pending local
  edits retain the organisation-visible banner: readers see last saved content.
  Keep existing Unsaved changes/Saving/error feedback separate.
- During publication retain private banner until confirmed saved response or
  existing lost-response reconciliation establishes successful publication.
- Loading/error/access denial does not invent a third visibility state or claim
  visibility without a loaded ticket. Never show a fabricated organisation name.
- Wrap long names on mobile; icons decorative/aria-hidden, text carries meaning.
  No Make public action, unpublish, archive or permission changes.

## Icons and module/test seams

Use lucide-react with named Lock/Eye imports and consistent size/stroke styling
for reusable site icons. Library documentation: https://lucide.dev/guide/react/.
Read-only dependency/security preflight for the package addition; preserve lockfile
and review install changes. Main agent implements using local codebase-design/TDD.

Reuse RequestScreen/RequestEditor and one shared visibility banner module. Fetch
organisation name via existing session-authorized HTTP seam. No storage, policy,
provider or mutation changes. Browser tests cover private/Publish transition,
published author/member parity, pending edits, failed/ambiguous publication,
loading/failure, long-name/mobile wrapping and accessible icon/text. Existing
HTTP/storage authorization tests remain unchanged. Independent code review at
completion; update guides and existing sanitized session log.

## Follow-up: navigation and metadata suggestion

User explicitly requested a left arrow on Back to requests and banner placement
at the top of the left ticket panel, matching the reference. Use Lucide ArrowLeft
with shared icon style on all ticket back links, preserving their accessible
name. Test at existing browser seam: author/reader card containment, flush top
edge, mobile wrapping, arrow/link accessibility and navigation. No state changes.
User subsequently approved moving the collapsed metadata section beneath
Publish/Update, before team discussion, labelled About this ticket. Readers get
the same section at the bottom of the ticket card, after Refresh saved request.
Keep author/publication/last-modified data and native keyboard-accessible details
behaviour; remove the old topbar toggle. Existing browser tests check position,
collapsed/expanded metadata and author/reader consistency.

## Follow-up: always-visible metadata and save timestamp

Show About this ticket as a static section for authors and readers, in its
current position at the bottom of the ticket card. Keep author, publication,
and modification details visible. Put the author's save status after those
details. A saved draft shows **Last autosaved** with its own server timestamp.
Delivery-only changes leave that timestamp intact. A new draft awaits its
first autosave. Older drafts with an unknown autosave time and published
tickets show **Last saved**. Keep pending and failure feedback and the existing
save behavior.

Record the timestamp atomically with a draft content revision and clear it on
publication to keep draft activity private. Use the existing authenticated
HTTP/storage tests for save, delivery-only updates and publication, and the
author/reader browser journeys to verify display and placement.

## Follow-up: site-wide back links

Use the same left arrow and spacing for Back to requests, Back to workspace,
and Back to sign in. Each link retains its label, destination, and navigation
behavior. The arrow is decorative. Extend the existing account and ticket
layout browser journeys to verify the links and keyboard navigation.
