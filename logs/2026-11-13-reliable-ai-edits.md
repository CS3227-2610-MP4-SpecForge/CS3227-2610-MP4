# 2026-11-13: Reliable PM AI edits

- Changes: fixed the PM assistant's silent and spurious failures
  ([spec](../workflow/specs/2026-11-13-reliable-ai-edits.md)). A live `qwen3.5:9b`
  probe on an unchanged synthetic ticket showed Apply answers failing because the
  model paraphrases `find` text and invents field names. Edits on tickets up to
  6,000 characters now return the whole revised ticket for per-change review;
  longer tickets keep exact-text edits with linear whitespace/escaped-line-break
  tolerance. Reply-only drafts and answer turns now fail visibly (refunded, Try
  again); reply-only edit turns show "No ticket changes suggested."; prompts stop
  claiming the ticket was updated. Title and Description are read-only while AI
  responds (not when the conversation read failed), accepting/undoing/reloading
  is blocked meanwhile, and the status reads "AI is responding…". Guides updated.
- Validation: `npm run verify` passed (330 tests, build). Browser
  `requests.spec` on port 3001: 18 passed, 1 failed — the @smoke journey's
  "Requests" link is now ambiguous after the organisation overview change; it
  fails identically without this change. After the character-count split, the
  full browser suite on port 3001 had 57 passed and 1 failed, the same @smoke
  locator (it matches the section nav link and the overview's empty-state
  link). Scoping that click to the "Organisation sections" nav fixed it:
  `requests.spec` then passed 19/19. No live SoC rerun after the change.
- Review: first review found the regex-based tolerant matcher quadratic with a
  stack overflow on ~4,000-word finds; replaced by a linear matcher with a
  regression test. Reload/check-saved buttons now also wait for AI. A second
  review flagged an unspecified character-count feature mixed into the diff; it
  was split out of this change, and the final diff was approved after `npm run
  verify` passed again (330 tests, build).
- Open: manually try Apply answers and a long Draft with AI against SoC. The
  split-out character-count feature needs its own spec, guide entry and review.
