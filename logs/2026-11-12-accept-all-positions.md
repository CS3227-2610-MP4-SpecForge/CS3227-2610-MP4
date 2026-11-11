# 2026-11-12: Accept all with repeated lines

- Changes: Accept all now applies proposals whose change anchors repeat, such as
  "Keep\nOld\nKeep" → "Keep\nKeep\nKeep", in full. Previously one change was
  skipped. While a field is exactly its original or proposed text, each change is
  placed at the line position the diff found, so statuses, Accept and Undo are
  exact there. Accept all is now one batch: it locates every change in the same
  snapshot and splices from the bottom of the field up. It skips a change only
  when that change overlaps an earlier one in an edited ticket. See
  [the spec](../workflow/specs/2026-11-12-accept-all-positions.md).
- Validation: `npm run verify` passed. Vitest ran 190 tests, all passing; it
  skipped 83 database and manual SoC tests, which need a local stack. The new
  unit tests are in `ticket-changes.test.ts`, and two component tests in
  `change-review.test.tsx` cover the full apply and the remaining skip case.
  Integration and Playwright suites were not run, because this change touches no
  database or permission code.
- Open: in a partly applied ticket with repeated lines, the context rules can
  still mislabel a row. For example, after accepting only the deletion in
  "Keep\nKeep", the insertion also reads as applied. Fixing that needs a
  whole-field alignment rather than one-line context.
