# AI chat transcript and per-change review

Status: approved by the user on 2026-11-11 ("confirmed") after a grilling
interview. Builds on [the PM AI assistant redesign](2026-11-10-pm-ai-assistant-redesign.md);
this spec replaces its latest-result box, "Earlier requests" history and single
accept/discard review.

## Problem

The assistant panel is narrow, hides earlier turns behind a toggle, shows ticket
changes away from the reply that proposed them, and only allows accepting or
discarding a whole suggestion.

## Behaviour

### Panel

- The open panel is about 440px wide; the ticket page may grow to about 1,400px.
- One transcript, oldest first, scrolls inside the panel and follows the newest
  reply. When the user has scrolled up, a new reply shows a "New reply ↓" pill
  instead of moving them.
- Desktop: the panel is sticky and fills the viewport height. Usage bar, Check
  for gaps and the composer stay pinned at its bottom. Stacked (≤1000px): the
  transcript is capped at about 60% of the viewport height.
- Usage bar: brand purple bar of remaining requests, labelled
  "14/20 AI requests left this hour", red at 0, with "More at HH:MM" once fewer
  than 5 remain.
- Gaps checklists and failure notices render inside the AI reply. Only the newest
  unanswered checklist on the current ticket is interactive; older ones are
  read-only. Only the newest failed turn offers Try again.
- The first draft of an empty, untitled private ticket still fills the editor
  directly with Undo AI draft. Suggestions are not opened automatically.

### Change card

Each reply with a proposal shows a card: a summary ("4 changes: title and 3 in
Description"), a status (Not reviewed, N of M applied, All applied, Dismissed,
Outdated) and Review changes, which opens the review modal.

### Review modal

- Shared `Modal` with the organisation management dialog style; about 1,200px by
  90% viewport height on desktop, full screen on narrow screens.
- Rows: Title first, then each changed Description block. Original on the left,
  proposed on the right, word-level highlights. Unchanged stretches collapse to
  "N unchanged lines" and can be expanded. A Formatted toggle renders Markdown.
  Narrow screens stack Original above Proposed.
- Accept applies that row to the editor immediately; the row shows Applied with
  Undo. Reject marks it Rejected for the rest of the page session (no reopen).
  Accept all / Reject all act on open, applicable rows; Accept all is one editor
  update.
- After each action focus moves to the next open row. ✕, Esc or Done (with a
  "3 applied, 1 rejected" summary) close it and return focus to the reply's
  Review changes button.
- Accepting is an ordinary edit: private tickets autosave, published tickets
  stay local until Update. While a save problem blocks editing, Accept and Undo
  are disabled with the save-problem explanation.

## Change rules

A change is a run of changed lines between the stored `input_fields` and
`proposal` of the turn, located by its lines plus the unchanged line on each
side (or the start/end of the field). Against the current ticket:

- **open**: the original lines with their context occur exactly once and the
  proposed lines do not;
- **applied**: the proposed lines with their context occur exactly once and the
  original lines do not;
- **outdated** otherwise ("You've changed this part since"); it cannot be
  accepted or undone.

An occurrence of the shorter block that lies inside an occurrence of the longer
one (an inserted paragraph keeps the blank line before it) is part of that
longer occurrence, not a second one. While a field is exactly its original or
proposed text, changes are placed at their diff positions instead. Accept all
applies open changes as one batch located in a single snapshot and says how many
it skipped because they overlapped an earlier change (see
[2026-11-12-accept-all-positions.md](2026-11-12-accept-all-positions.md)).

Accept replaces the single original occurrence; Undo replaces the single
proposed occurrence. Replacement text is inserted literally. Rejections are kept
in browser memory only; after a reload a rejected row shows as open.

## Out of scope

No database, server or SoC prompt changes. Suggestions are not persisted per
change.

## Acceptance criteria

1. Every turn is visible in one scrolling transcript; there is no Earlier requests toggle.
2. Each proposal reply shows a change card with summary, status and Review changes.
3. The modal shows original and proposed side by side per change, with per-row
   Accept/Reject/Undo, Accept all, Reject all, Formatted and Done.
4. Accepting one change leaves the others open and usable; editing an unrelated
   part of the ticket does not outdate other changes.
5. A change whose original text was edited shows as outdated and cannot be accepted.
6. The usage bar shows "x/20 AI requests left this hour".
7. The organisation management dialog uses the same shared Modal.

## Testing interfaces

- Unit (`src/tests/ticket-changes.test.ts`): `ticketChanges(before, after)`,
  `changeStatus(change, fields)`, `applyChange` / `undoChange`, `summarizeChanges`.
- Browser (`requests.spec.ts`, `ticket-layout.spec.ts`): transcript order, change
  card, modal per-row accept/reject/undo, outdated rows, focus return, usage bar,
  management dialog regression.
