# Accept all applies ambiguous proposals fully

Status: requested by the coordinating session on 2026-11-12 as a follow-up to
the component test tier; amends the change rules in
[2026-11-11-ai-chat-review-modal.md](2026-11-11-ai-chat-review-modal.md).

## Problem

Changes are located by their lines plus one unchanged line on each side. When
lines repeat, applying one change can leave a later one ambiguous. With
description "Keep\nOld\nKeep" and proposal "Keep\nKeep\nKeep", Accept all
deleted "Old", then could not place the insertion. It reported "1 change could
not be applied…" and left "Keep\nKeep". Rows then showed misleading states,
because the context alone cannot tell where a change sits in repeated text.

## Behaviour

1. **Exact positions at the endpoints.** When a field is exactly the turn's
   original text, each of its changes is open at the position the diff found.
   When the field is exactly the proposed text, each change is applied at its
   proposed position. Accept, Undo and the row and card statuses use these
   positions. In every other state the context rules are unchanged.
2. **Accept all is one batch.** It finds every open change in the same
   snapshot of the ticket, then applies them all at once from the bottom of the
   field up, so one change cannot move or blur another's anchor.
3. A change in the batch is skipped, and counted in the existing "N changes
   could not be applied because an earlier change overlapped them" notice, only
   when its lines or context overlap the lines of an earlier change in the same
   batch. This can only happen after the user has edited the ticket since the
   suggestion.

## Known limitation

Between the endpoints, repeated lines can still mislabel rows. After undoing
only the insertion above ("Keep\nKeep"), both rows read as applied; undoing
only the deletion makes that row outdated, so it cannot be re-accepted. Fixing this
needs whole-field alignment and is out of scope here.

## Acceptance criteria

1. Accept all on "Keep\nOld\nKeep" → "Keep\nKeep\nKeep" yields the proposal with
   no notice, and every row shows Applied with a working Undo.
2. Accepting from the untouched original places a change at its diff position
   even when its context occurs more than once.
3. Accept all reports a skipped change only for overlapping open changes in an
   edited ticket, and applies the others.
4. Existing change rules, including outdated detection, still hold.

## Testing interfaces

- Unit (`src/tests/ticket-changes.test.ts`): `applyChanges(changes, fields)`
  returning `{ fields, skipped }`, plus `changeStatus`, `applyChange` and
  `undoChange` on repeated lines.
- Component (`src/components/change-review.test.tsx`): Accept all on repeated
  lines, and the skip notice with an edited ticket.
