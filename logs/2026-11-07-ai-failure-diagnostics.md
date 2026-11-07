# Session summary: 2026-11-07 / AI failure diagnostics

Human verification: pending
Base: ae7bed4 plus existing uncommitted request/AI workspace work, preserved.

- User reported SoC dashboard502/60,014ms and asked whether our timeout caused
  it. Inspected source: app provider deadline45seconds, browser wait75seconds.
  Explained that dashboard duration suggests upstream behaviour but does not
  establish the cause; client cancellation need not cancel upstream processing.
  User explicitly requested distinguishing failures, then asked to continue.
- Saved concise authorised spec under workflow/specs; used existing approved
  protocol, HTTP, local database and browser seams with local TDD/design/security
  guidance. No provider quota or timeout change and no automatic retries added.
- Implemented local_timeout only when the adapter's own deadline signal aborts,
  upstream_http for a received non-success HTTP response, network_error for
  transport/stream failure. Invalid output remains separate. Only allowlisted
  source, monotonic app-observed elapsed milliseconds and numericHTTPstatus are
  retained. No raw provider bodies/headers, exception details or content logs.
- Added additive private chat diagnostic column and worker-only completion
  parameter with strict database validation; retained verified membership,
  ownership, generation/lease and final storage checks. Explicit retries clear
  old metadata. Existing unavailable rows remain readable with a generic notice;
  no historic diagnostic/timing is guessed or backfilled.
- UI displays distinct local deadline, upstreamHTTPstatus, network failure and
  transient browser waiting-limit messages. Provider diagnostics survive refresh;
  browser timeout asks to refresh/reconcile and does not imply a SoC failure.
- TDD RED/GREEN: upstream502 initially mapped tounavailable; HTTP failure details
  initially could not persist. Focused tests passed after adapter/storage wiring.
  A strict metadata regression exposedSQLNULL permitting missing status; a
  follow-up additive validator explicitly rejects missing/non-error status and
  incompatible/extra keys. Browser waiting-limit regression initially showed
  generic connection failure; explicit client deadline classification fixed it.
- Verification:14focused provider/client tests passed including deadline during
  header fetch/body reading, unrelatedAbortError, network failure, actual502,
  sanitized metadata and browser wait. Full local database suite passed34cases;
  all14Chromium journeys passed in36.1seconds, including distinct messages and
  durable reload. Tests use fake transports/local AI only; no live SoC calls.
- Independent reviews: security preflight supplied concrete diagnostic constraints;
  code review approved without blockers. First security post-review dispatch
  failed due provider usage limit; after user asked to continue it completed and
  approved. Reviewers read-only, no secrets/network/children or suite repeats.
  Three successful review turns plus one failed review attempt; aggregate tool,
  token/cache and elapsed savings not measured.
- Updated User/Developer Guides and specification. Local additive migrations
  applied without reset; no environment credential changes, commit, push or
  deployment. Earlier work remains uncommitted. Final verify evidence below.
- Final `npm run verify` passed lint, TypeScript,32HTTP/provider/client tests and
  production build. Its35skipped cases are34database cases passed separately plus
  the historical one-off migration test. Diagnostics screenshot visually checked;
  messages use existing shared notices and retain source/status/elapsed on reload.
  Final whitespace and environment-ignore checks passed. Changes uncommitted.

- Subsequent user request: increase the local provider timeout to60seconds.
  Updated adapter deadline, current UI messages, fake fixture, browser assertions
  and guides; browser wait remains75seconds and worker lease120seconds. Focused
  TDD first reproduced both fetch/body deadline expectations failing at45seconds
  before the change. No live SoC calls or credential reads.
