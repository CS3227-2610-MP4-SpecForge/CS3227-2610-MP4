# SoC writing verification and stabilization — 2026-11-08

Human verification: pending. Baseline b1e3f85 was clean and locally committed;
no existing work was replaced. No commit or push performed.

## Request, scope and implementation

User requested six checks of real SoC writing using synthetic tickets, at most ten
calls, <=2,000 output tokens and 60 seconds each, no automatic retries. Existing
approved ticket-first/invalid-output specifications and provider/authenticated
HTTP/local RPC/browser seams govern the work. Scope recorded in
workflow/specs/2026-11-08-soc-writing-stabilization.md; no new product decisions.
Main agent used local TDD, codebase-design and security skills.

Live structured proposals showed scope invention and one clarity request returned
only discussion. Strengthened the existing system prompt: forbid unsupported
storage/lifetime/workflow choices; record material unknowns explicitly and consistently
across sections; treat Improve clarity as an editing instruction; request ATX
headings and include a JSON shape example. Strict schema, section merging,
context/output/body/time caps, authorization, privacy, stale-edit guards and
explicit publication remain unchanged. No automatic retry/fallback or schema
relaxation. Updated DeveloperGuide and UserGuide with measured limitations.

## Live evidence (separate from fake-provider tests)

Nine actual synthetic SoC calls, plus one initial sandbox-blocked transport attempt
(170 ms, network_error); conservatively ten attempts total. Network-enabled calls
used the actual createSocProvider and configured qwen3.5:9b, JSON mode, 2,000-token
cap, 60-second deadline, 48,000-byte context and 64KiB response caps. Calls had no
automatic retries. Manual follow-up cases below consumed the same budget. No
credentials, raw envelopes, reasoning or real ticket data were printed or retained.
Only validated synthetic reply/proposal content was inspected; log records summaries.

| Live call | Prompt revision / case | App-observed ms | Result |
| --- | --- | ---: | --- |
| 1 | Baseline / clear filter idea | 5,189 | Complete title/description; unsupported storage choice and persistence guarantees. |
| 2 | Baseline / CSV material unknowns | 60,038 | local_timeout; diagnostic elapsed_ms 60,036. |
| 3 | Baseline / explicit clarification | 2,566 | Human reply, proposal=null; extra unrelated filter question. |
| 4 | Scope guidance / Improve clarity | 54,113 | Human reply, proposal=null; no reviewable changes. |
| 5 | Scope guidance / Add acceptance criteria | 3,872 | Strict section constraint rejected unsafe_section. |
| 6 | Scope guidance / clear idea | 12,529 | Strict adapter rejected invalid_schema. |
| 7 | Scope guidance / Add acceptance criteria | 3,671 | Strict adapter rejected invalid_schema. |
| 8 | Scope guidance / CSV unknowns | 6,871 | Complete proposal with explicit column/filter questions, but Out of scope contradicted unresolved filter handling. |
| 9 | Final prompt / Improve clarity | 6,324 | Complete reviewable proposal; added session/incognito restrictions and omitted supplied All-reset behavior. |

The final prompt additionally clarifies editing, consistent unknowns and ATX/JSON
formatting. Only call 9 exercised that final revision. It did not establish semantic
correctness. No further live calls were made. Successful complete structure is not
the same as useful scope-preserving generation. No reliable complete drafting,
consistent unknown handling or successful live acceptance-criteria flow is claimed.
Actual upstream quotas/internal timing and latency distributions remain unknown.

Live harness ran outside ordinary tests and was temporary. It exercised actual
provider validation and the section constraint, without authenticated HTTP/storage
or browser submission. Persistence, authorization, exact section preservation,
stale guards and safe UI failures are separate deterministic evidence below.

## Deterministic verification

Provider public seam test first failed because outbound system instructions lacked
explicit scope/unknown rules; passed after adding them. A second RED required
explicit clarity-edit and ATX instructions, then GREEN. All 22 provider tests pass.
The added test proves the outbound prompt contract and separation of untrusted
input; it does not prove model compliance or safe semantics.

Initial local integration/start attempts failed because sandbox could not access
Docker. Docker was already available; elevated Docker access resolved testing
without restarting setup or resetting data. npm run test:integration passed all
38 local database tests, including authenticated HTTP section-only merge, gaps
suppression, unchanged saved work, durable safe diagnostics, private reloads,
worker/access restrictions and retry clearing. No live provider used by these tests.

npm run verify passed lint/typecheck, 41 deterministic tests (39 database/migration
checks skipped in this invocation), and production build before the final prompt
wording addition. Final verification/browser results recorded below when complete.

## Independent reviews and limits

Security preflight required actual bounded adapter evidence, no raw envelopes,
authenticated HTTP section-preservation evidence, retained strict validation and
existing controls. Code/architecture and security post-reviews approved the final
prompt/test diff without blocking findings. Both explicitly limited prompt tests
to wire behavior. Reviewers were read-only, no credentials/live calls/children.
Three reviewer dispatches (security preflight, code review, security post-review).
No rework findings. Total tool calls, coding-agent tokens/cache and wall time were
not measured. Nine live calls, one sandbox-blocked attempt, zero automatic retries.

Remaining work: live writing quality/reliability is unresolved. Any further SoC
investigation needs a new bounded call authorization. No Developer AI, provisioning,
provider discovery/quota verification, deployment, commit or push was undertaken.

## Final checks

- Final npm run verify after all prompt changes: lint, typecheck, 41 deterministic
  tests and production build passed; 39 database/migration tests skipped in this
  ordinary invocation, separately covered by the integration run except the
  intentional one-off historical migration test.
- SPECFORGE_BROWSER_ORIGIN=http://localhost:3001 node src/tooling/test-local.mjs
  requests-browser: all 16 request journeys passed in 1.8 minutes with local fake
  AI. Includes rough draft/Undo, inline review, targeted actions, stale/manual
  preservation, private published edits, lost-response recovery and distinct
  durable failure notices. No user server was stopped.
- Browser-generated next-env.d.ts changes restored to baseline after the runner
  exited; final verify left it clean. git diff --check passed.
- Live first-draft/acceptance success and final-prompt unknown handling remain
  unverified. Final-prompt clarity produced a proposal with semantic defects.
  Passing deterministic tests establish application controls, not model quality.

## Approved follow-up: tolerate harmless response variation

After discussing strict formatting versus writing quality, user approved the narrow
response-contract change with “proceed”. Recorded the agreed behavior and existing
provider/authenticated HTTP/local DB seams in
workflow/specs/2026-11-08-tolerant-ai-response.md. Main agent implemented with local
TDD/codebase-design/security skills, preserving all earlier uncommitted work.

`validateAiReply` now strips unknown response/proposal fields, reuses existing
bounded title/description validators, and supplies “Review these suggested ticket
changes.” when a complete proposal has absent/null/blank reply text. Wrong-type
known fields and partial/blank/oversized proposals remain invalid_schema, even
with a valid human reply. Clarification still requires nonblank text and no
proposal. No prose extraction or type coercion. Internal output, client requests
and storage remain canonical; no storage migration. Earlier “strict validation
unchanged” statements describe the first stage; this follow-up deliberately
relaxes only provider extras and missing proposal reply text.

Two observed provider RED/GREEN cycles: unknown root/nested proposal fields first
failed, then passed after stripping; missing/null/blank proposal replies first
failed, then passed after conditional neutral fallback. Additional invariant tests
cover wrong types, partial proposals, unknown publish/permission fields, Unicode
limits and preserving ticket whitespace. Provider seam: all 49 tests passed.

Final npm run verify passed lint/typecheck, 68 deterministic tests and production
build (40 DB/migration tests skipped by ordinary invocation). New authenticated
HTTP integration uses actual SoC adapter with fake external transport and real
local Supabase: normalized proposal/reply persists and reloads privately; title
and unrelated acceptance sections remain intact; extra publish/tool/diagnostic
keys are discarded; malformed proposal fails with safe metadata and saved
unpublished revision remains unchanged. Initial integration assertion incorrectly
used a nonexistent status field; corrected test to existing submitted_at:null.
Rerun npm run test:integration passed all 39 tests in 12.88 seconds.

No UI implementation changes. Earlier 16 browser journeys remain historical
unchanged-control evidence, not a newly repeated run. git diff --check passed.
DeveloperGuide/UserGuide updated. Independent security preflight and code/security
post-reviews approved with no findings; reviewers received the final 39-test pass
confirmation. Three reviewer dispatches for this follow-up; no live calls,
automatic retries, commits, pushes, deployment/provisioning or Developer AI changes.
Total tool calls, coding tokens/cache and elapsed time were not measured.

Compatibility is proven for deterministic fixtures, not the previous discarded
live invalid_schema responses (their precise shape was unavailable). Live model
compliance and writing quality remain unresolved and require a separately
authorized bounded check. Human verification remains pending.

## Commit authorization

User subsequently requested committing the changes. Reviewed the complete working
diff and git diff --check; included both stabilization and tolerant-contract source,
tests, approved specs and guide/session documentation. No additional application
changes or live calls. Commit locally; do not push.
