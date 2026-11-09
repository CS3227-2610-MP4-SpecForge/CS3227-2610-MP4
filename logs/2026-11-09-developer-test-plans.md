# Session summary: 2026-11-09 / Developer AI test plans

Human verification: pending
Revision or working diff reviewed: branch `feat/deploy-and-pages`, continuing
from the deployment and product-website work in the same session

- Prompts and requests (sanitized summary of all development interactions): the
  user asked for the Developer role's AI feature next. Two decisions were put to
  them and answered: the feature produces structured, reviewable test cases
  rather than generated test code, and a saved plan is visible to the whole
  organisation rather than private to the generating developer. The existing PM
  chat pipeline, its migrations and its diagnostics conventions were read first
  so the new feature could reuse them instead of restating them.
- Agreed behavior / specification and decisions:
  `workflow/specs/2026-11-09-developer-test-plans.md`. A Developer member
  generates cases for a published ticket, reviews them, then saves them to the
  ticket. Generation is worker-dispatched and role-gated in the database; saving
  runs under the developer's own session because it is their decision. A plan
  generated against older ticket content cannot be saved over newer wording.
- Implementation or documentation changes:
  - `src/supabase/migrations/20261109002000_developer_test_plans.sql`:
    `private.valid_test_plan`, `public.test_plan_turns`,
    `public.ticket_test_plans`, `private.test_plan_admission`,
    `private.is_ticket_developer`, `private.lock_test_plan_developer`,
    `public.read_test_plan`, `public.begin_test_plan_turn`,
    `public.finish_test_plan_turn`, `public.save_test_plan`, with RLS and grants.
  - `src/server/soc.ts`: extracted `requestSocJson` so the bounded request,
    envelope checks and failure mapping are shared; `createSocProvider` keeps its
    previous behaviour and became a thin caller. Completion budget is now a
    parameter (chat 2,000 tokens, test plans 3,000).
  - New `src/test-plans.ts` (shared caps/types), `src/server/test-plan-ai.ts`
    (instructions and validator), `src/server/test-plans.ts` (routes),
    `src/components/test-plan-panel.tsx` (review UI).
  - `src/server/application.ts`, `src/server/runtime.ts`: wired the feature in;
    the worker factory and the local fake-adapter gate were extracted so both AI
    features share one definition. `src/components/http.ts` gained a `PUT`
    option. `src/tests/fake-ai.ts` gained `localFakeTestPlanAi`.
  - `src/components/request-editor.tsx`: the panel appears on published tickets
    in the reader view (Developers can generate) and read-only under the PM's
    editor.
  - `src/tooling/test-local.mjs`: new `test-plans` mode, and the database test
    added to the default integration run.
  - Guides: a Test plans section in the user guide with its failure entries, a
    Developer test plans design section in the developer guide, plus corrected
    README and `AGENTS.md` statements.
- Tests/checks: command, expected and observed result; RED/GREEN for behavior
  changes:
  - Node 24.22.2 was installed with nvm at the user's instruction (this machine
    previously had only Node 18.18.2 and older), `npm ci` re-run, and every
    check below executed on it. A globally installed npm shim (9.4.2) shadows
    the nvm npm on PATH, so commands were run with `C:\Program Files
odejs`
    prepended.
  - `npm run verify` (lint, typecheck, `vitest run`, `next build`): observed
    green on the second attempt. 104 tests passed, 59 skipped (the database and
    browser suites, which are gated on a local stack), 4 test files passed, 7
    skipped. `next build` compiled and prerendered all 9 routes.
  - RED/GREEN on the new unit tests: the first `npm run verify` failed one real
    case, `maps extra top-level plan keys to an invalid-output failure`. The
    failure was in the test, not the feature: `validateTestPlanReply` strips
    provider extras by design (the sibling case asserts exactly that for
    case-level extras) and then rebuilds the plan field by field, so an extra
    key on `plan` cannot reach storage either. The design was kept and the
    expectation corrected into its own test asserting
    `Object.keys(result.plan)` is `["cases"]`. `src/tests/test-plans.test.ts`
    now runs 19 cases, all observed passing.
  - `npx tsc --noEmit` and `npx eslint .`: clean (observed, both before and
    after the Node upgrade; two earlier self-corrections, a `TestCase` kind
    widened to `string` in a fixture and a `setState` called synchronously in an
    effect body, were found by these two tools).
  - `node src/tooling/test-local.mjs test-plans` and `npm run test:integration`:
    **not executed.** Observed output: "Local Supabase is unavailable. Run
    npm run db:start first." Docker Desktop is not installed on this machine
    (no `docker` on PATH and no install under Program Files), and installing it
    was not in scope here. Consequence: the 4 database cases in
    `src/tests/test-plans.database.test.ts` have still never run, and
    `src/supabase/migrations/20261109002000_developer_test_plans.sql` has not
    been applied to any database. Nothing about the SQL, the RLS policies, the
    role gating or the HTTP authorization order may be reported as verified.
  - No call has been made to SoC LLM for this feature; the panel has no browser
    check.
- Agent dispatches: role, scope/context supplied, result and handoff: none. The
  work was done in the main chat. The workflow classifies LLM input/context/output
  and authorization changes as sensitive, so a security preflight and an
  independent code review are both owed on this slice and have not happened. The
  existing security guidance was applied directly instead: worker-only admission
  and completion, role and publication gating in the database, untrusted content
  carried as a separate payload, provider extras stripped, plain-text rendering
  and no auto-retry.
- Review findings, resolution and retries: no independent review yet. The two
  self-corrections above were found by the type checker and the linter, not by
  review.
- Resource measurements: elapsed time, tool/dispatch/retry counts, optional
  tokens/cache; unavailable if not captured: one chat session continuing the
  deployment work, roughly 40 tool calls across both pieces, zero subagent
  dispatches, zero provider calls to SoC LLM, zero hosted database operations.
  Deliberate reading order kept context small: the PM chat migration, the SoC
  adapter and the chat route were read in full because the new feature mirrors
  them; the large UI components were read only at the two places the panel had to
  attach. Token and cache figures were not captured.
- Remaining work / next action (use as a handoff only if unfinished):
  1. Install Docker Desktop, then `npm run db:start`, apply the new migration
     and run `node src/tooling/test-local.mjs test-plans` and the full
     `npm run test:integration`. Until then the database half of this feature
     is unproven.
  2. Exercise the panel by hand with `SPECFORGE_LOCAL_AI_FAKE=1` once the stack
     is up.
  3. Write the browser spec for the panel; `localFakeTestPlanAi` already
     supports it, including simulated failures driven by the focus note.
  4. Dispatch the security specialist and an independent code reviewer on this
     slice, as the workflow requires for LLM and authorization changes.
  5. One real SoC LLM generation against a published ticket, to check the 3,000
     token budget is enough for 12 cases and that the model honours the
     plain-text and kind constraints. Until that runs, the prompt is untested
     against the real provider.
