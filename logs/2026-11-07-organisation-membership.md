# Session summary: 2026-11-07 / organisation membership

Human verification: pending
Revision: existing uncommitted checkout based on 223efba; no commit or push.
Most application files were already untracked at session start. Existing account
slice, environment configuration and manual development server were preserved.

- Request: continue the approved membership slice without scaffolding/setup
  restart; invitations, accept/decline, removal, admin changes, leave and
  concurrent last-admin protection. Read the requested project/workflow/spec,
  developer guide and prior session log. No unresolved product choices remained.
- Specification: `workflow/specs/2026-11-07-organisation-membership.md` records
  the requested subset, concrete interfaces and already-approved HTTP/database/
  browser test seams. Invitations are in-app, account-bound and seven days;
  accepted members are ordinary members; completed invitations cannot replay.
- Implementation: main agent used local TDD/codebase-design/security guidance.
  Three additive database migrations implement invitation RLS, RPCs, persistent
  20-attempt/hour/organisation invite/resend admission and serialised membership
  transitions. Current verified permissions are checked after the organisation
  lock. No ordinary operation uses privileged credentials. HTTP retains strict
  8-KiB JSON, trusted Origin and private/no-store sanitized responses.
- UI/guides: shared membership inbox, invite/admin controls, destructive-action
  confirmations, leave and refresh; existing theme/controls reused. Workspace
  refreshes selected membership/admin status. Updated User/Developer Guides,
  README and current-state wording in AGENTS.md. PM/Developer AI, requests,
  demo kits, deployment and SMTP remain outside this slice.
- Local execution: Docker socket access required sandbox escalation; existing
  local Supabase was started/accessed and additive migrations applied, without
  resetting data. CLI output was captured/suppressed to avoid credentials. No
  `.env` or `.env.local` content was read/changed; no SoC/hosted requests made.
  An initial browser run found the user's port-3000 server. Added optional
  allowlisted port 3001 and `.next-browser` output isolation; retained server.
  Generated output is ignored by Git/ESLint. Next.js generated type configuration
  was retained and typechecked. No dependencies were added.
- TDD evidence: RED HTTP inbox returned404 instead of401; fixed session dispatch.
  RED database tests reported missing invite/lifecycle/member RPCs; each loop
  passed after its implementation and additive migration. RED browser journey
  lacked membership controls; GREEN after wiring the UI. Browser assertions were
  scoped to handle multiple legitimate status notices and Next's route announcer.
  An initial lint invocation included generated browser output; added its ignore
  and corrected the membership loading effect/type mismatch. These failures were
  tooling/UI feedback, not claimed passing results.
- Test evidence before review: full `npm run verify` passed lint, TypeScript,
  17 HTTP tests and production build (database tests explicitly skipped there).
  Added HTTP malformed-input/provider-failure test then passed all18 HTTP tests.
  `npm run test:integration` passed16 real local database cases, including
  concurrent leave/demote/remove, cancellation versus acceptance, verification,
  RLS/direct-write denial, isolation, replay, role independence and rate limits.
  Five Chromium journeys passed, covering both roles, expiry/resend/cancel,
  accept/decline/reinvite, promote/demote, removal, admin handover/leave,
  last-admin failure, keyboard focus and mobile overflow. Desktop/mobile
  screenshots were inspected for shared styling/layout.
- Independent reviews: security specialist preflight returned eight testable
  control requirements; post-change review approved for the local slice, with
  hosted/future-feature limitations. Independent code/architecture reviewer
  found one P2: self-demotion could reload with stale admin status and retain a
  false permission error. A browser regression delaying the organisation list
  reproduced the error. Coordinated membership refresh after updated admin
  status and cleared superseded load errors; all five Chromium journeys passed afterward, including the delayed self-demotion
  regression. Lint/typecheck passed. Code reviewer re-inspected the fix and
  approved it with no remaining blocking findings. Security reviewer received
  the final HTTP/browser evidence; no storage/security controls changed.
- Resources: two independent read-only reviewer agents; four review turns
  (security preflight/post-review, code review/fix review). Reviewers received scoped
  files/spec/evidence, used no children, secrets or hosted side effects. Aggregate
  tool counts, tokens/cache and elapsed resource savings were not measured.
- Limits: lists cap at100; hosted abuse tuning and deployment verification remain
  release gates. No completion claim for the remaining MVP. Human verification
  of this summary is still pending.
- Final checks: `npm run verify` passed lint, TypeScript, all18 HTTP tests and
  production build on the final UI revision. Its16 database tests were skipped
  as designed; the separate integration run above passed all16 on unchanged
  storage/HTTP logic. Final browser rerun passed all5 journeys in34.0 seconds,
  including delayed self-demotion; final full mobile membership screenshot was
  visually inspected. `git diff --check` and secret/generated-output ignore checks
  passed. Existing uncommitted work remains uncommitted; no reset, deployment,
  commit or push was performed.
