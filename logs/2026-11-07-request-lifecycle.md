# Session summary: 2026-11-07 / request lifecycle

Human verification: pending
Base revision: ae7bed4; implementation remains in the working tree.

- Request/approval: user asked to proceed with the next planned manual lifecycle
  slice, then explicitly approved the concrete spec and test seams through the
  client question. `workflow/specs/2026-11-07-request-lifecycle.md` records the
  approved750ms autosave, field/body limits, conditional revisions, publication
  semantics and exclusions. Earlier spec/preflight work waited for that approval.
- Main-agent implementation used local TDD/codebase-design/security guidance;
  no scaffolding, dependency installation, reset or implementation workers.
  Shared HTTP handling was extracted while existing18HTTP tests stayed green.
  Request HTTP validation uses the existing verified session and public-key
  Supabase adapter; no ordinary app call uses a privileged key.
- Storage: four initial additive migrations added private drafts, author-scoped
  creation idempotency, RLS/read interfaces, field validation, revision-checked
  saves, explicit publication/published editing and draft deletion. All writes
  lock the organisation before current membership/PM-role checks, then the
  authored request/revision. No direct authenticated table writes are granted.
  Membership loss hides work; rejoining restores author access; submitted work
  retains stable author identity after departure. No account deletion was added.
- UI: request lists and author/read-only screens share shell/theme/field controls.
  Draft saves are debounced and serialised while newer typing is preserved;
  published edits require explicit acknowledgement and Save changes. Failure
  stops autosave. Saved-version reconciliation distinguishes unchanged content,
  confirmed commit and conflict; reload/discard is explicit. No draft text is
  written to browser persistent storage or logs. Author display uses stable IDs.
- TDD RED/GREEN: missing create/save/publish/delete RPCs and request HTTP route
  failed before implementation, then passed focused local checks. Initial save
  SQL failed parsing a CASE expression; a bounded diagnostic identified it,
  parentheses fixed it and the unapplied migration then succeeded. Initial
  browser lifecycle failed at the absent workspace entry; passed after wiring.
- Local tests:7request database/HTTP cases passed before review: idempotency,
  revision races, publication acknowledgement/validation, deletion state,
  strictHTTP/body limits, PM/Developer/admin privacy, RLS/direct-write denial,
  cross-organisation identifiers, membership removal/rejoin and save/submit/
  removal races. Full integration initially passed23cases (16existing+7new).
  `npm run verify` passed lint, TypeScript,18HTTP tests and production build;
  database cases were explicitly skipped there. Added safe request503 assertion
  passed in that run.
- Browser evidence before review fixes:3request journeys passed, including
  PMautosave/resume/submit, Developer last-saved viewing, explicit published
  editing, lost creation/save responses, manual reconciliation/retry, in-flight
  edits, conflicts/local-text preservation and draft deletion. Added keyboard
  focus and script-looking plain-text rendering assertions. Desktop editor and
  mobile reader screenshots were visually inspected for shared styling/layout.
- Reviews: reused two independent read-only specialists. Security preflight
  returned8testable controls and required concrete create-response-loss handling;
  incorporated author/organisation-scoped idempotency before implementation.
  Security post-review approved the local controls with pending browser/HTTP
  evidence and hosted/future-feature limitations.
- Code review found3P2edges: browserBack bypassed the guard after client-side
  draft creation; skip link counted as departure and could disable later guards;
  storage's POSIX whitespace differed from JavaScript trim. Browser regressions
  reproduced both navigation failures. FEFF-only publication was accepted in
  RED; NBSP was already rejected locally. Fifth additive migration enumerates
  ECMAScript whitespace, and all9requestDBcases then passed. Editor entry now
  uses document navigation consistently with plain request links; same-document
  hash targets are excluded and click bypass expires if navigation does not leave.
  The first guarded Back run showed the prompt and retained text but exhausted
  the test deadline awaiting cancelled navigation; bounding that expected wait
  to2seconds fixed the test harness, with both assertions retained.
- Tooling: used existing disposable local Supabase via approved sandbox Docker
  access, additive migrations only, no reset or environment-file edits. CLI
  output was captured/suppressed; only synthetic SQL diagnostics were extracted.
  Existing manual port3000server was preserved; browser tests use isolated3001
  and `.next-browser`. A parallel typecheck/browser run raced generated type-file
  rewrites; sequential checks passed. Documented sequential Next checks and added
  focused local request/browser modes without changing ordinary check commands.
- Docs updated: User/Developer Guides, README, AGENTS current state and concrete
  Reflections. AI/conversations, demo kits, partner Developer AI, hosting/SMTP
  and deployment automation remain unimplemented or unverified as before.
- Resources: two reviewers reused, read-only/no children. Aggregate tool calls,
  tokens/cache and elapsed-resource savings not measured. No live SoC or hosted
  requests, real secret access, commit, push or deployment during this slice.

- Final reviews: code reviewer re-inspected all3fixes and approved with no remaining
  blocking findings. Security reviewer confirmed approval after the whitespace
  validator fix; native-navigation changes do not alter storage authorization.
  Five review turns total for this slice: security preflight/post-change/targeted
  follow-up, code review/fix review. Both received final pending test evidence.
- Final checks: all25local database tests passed (16existing+9request cases).
  All9Chromium journeys passed in27.0seconds, including history and skip-link
  regressions, plain-text script-looking content, keyboard/mobile, response loss,
  failures and concurrent typing. Final `npm run verify` passed lint, TypeScript,
  18HTTP tests and production build; its25database cases were explicitly skipped
  and verified separately. `git diff --check` and environment/generated-output
  ignore checks passed. No additional implementation remains in this approved
  slice; changes are uncommitted, local migrations applied, guides current.
