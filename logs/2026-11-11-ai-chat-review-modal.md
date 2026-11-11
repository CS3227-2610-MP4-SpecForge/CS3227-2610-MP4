# 2026-11-11: AI chat transcript and per-change review

- Changes:
  - Rebuilt the PM AI panel per [the spec](../workflow/specs/2026-11-11-ai-chat-review-modal.md), agreed through a grilling interview.
  - The panel is wider (440px, page up to 1,400px) with a single scrolling transcript, a pinned usage bar and composer, and a "New reply" pill.
  - Each reply with a proposal gets a change card.
  - A new review modal accepts, rejects and undoes individual changes.
  - `src/ticket-changes.ts` splits proposals into line-based changes in the browser. Status is derived from the current ticket; there are no database or server changes.
  - The organisation management dialog and the review now share one `Modal`.
  - User Guide, Developer Guide and `workflow/ui.md` are updated.
- Validation:
  - `npm run verify` passes (lint, typecheck, 163 unit tests, build). It was run on a copy without the git-ignored `local/` experiments, whose stale files fail typecheck in the checkout.
  - The final code passes all 19 request and all 4 layout browser tests.
  - The final full browser run had 49 passed and 4 failed. That run was abnormally slow (18.6 min, with single tests taking minutes), and all four failures passed on a focused rerun. The earlier full run had 52 passed and 1 failed (a membership modal test hit during mid-run edits), which also passed on its own.
  - No database changes, so integration tests were not rerun.
- Review:
  - The independent reviewer found a blocker: an insertion or deletion next to a repeated line (for example, blank lines between Markdown paragraphs) was reported outdated after applying. Fixed by treating a match nested inside the other side's match as part of it, with regression tests.
  - Also fixed: Accept all now reports changes it skipped, Review changes stays enabled during AI requests, Undo keeps focus on its row, and the new-reply pill no longer shows spuriously.
  - Not changed: the modal name is set by `aria-label`, which matches its visible title; status recomputes on every render.
- Open: compare the review experience on live SoC drafts; the changes have not been committed yet.
