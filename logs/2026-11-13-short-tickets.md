# 2026-11-13: Short tickets and whole-ticket AI edits

- Changes: ticket descriptions are capped at 3,000 characters in the editor,
  server and database ([spec](../workflow/specs/2026-11-13-short-tickets.md)).
  A migration lowers `private.valid_request_fields`, cuts stored descriptions,
  chat snapshots/proposals and test-plan snapshots to 3,000 in place (existing
  data declared disposable), and fails if any row still violates the bound.
  Every AI edit now returns the whole revised ticket; exact-text find/replace
  edits and their matcher were removed.
- Evidence behind the decision: a live `qwen3.5:9b` sweep (1.3k–23.5k synthetic
  tickets, 3 runs per action) found Apply answers worked 6/6 below 6,000
  characters and 1/6 above; Check for gaps failed at every size because the model
  put options inside the question text; Draft with AI always shortened the ticket.
- Validation: `npm run verify` passed (322 tests, build); `npm run
  test:integration` 104/104 after applying the migration to a local database
  that held 24,000-character rows; full browser suite 58/58 on port 3001.
- Open: Check for gaps output format; Draft with AI shortening content; no live
  SoC rerun after removing exact-text edits.
