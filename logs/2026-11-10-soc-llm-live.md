# Session summary: 2026-11-10 / First live SoC LLM runs

Human verification: pending
Revision or working diff reviewed: branch `feat/deploy-and-pages`, on top of the
deployment, product-website and Developer test plan work

- Prompts and requests (sanitized summary of all development interactions): the
  user asked whether the application was complete, then asked to take the SoC
  LLM settings from their MP3 checkout, wire them into this project and test
  them. No feature work was requested; the fix below came out of what the live
  calls revealed.
- Agreed behavior / specification and decisions: no new spec. One behaviour
  change to an existing feature, recorded here and in the guides: test plan
  validation now discards an individual unusable case instead of failing the
  whole generation, and says how many it discarded.
- Implementation or documentation changes:
  - `.env` (ignored by Git) now carries `APP_ORIGIN`, `SOCLAAS_BASE_URL`,
    `SOCLAAS_API_KEY` and `SOCLAAS_CHAT_MODEL`. The key is the user's own SoC
    credential, read out of their local MP3 `.env`; no key value was printed to
    the transcript, written to a tracked file or sent anywhere except
    `soclaas-api.comp.nus.edu.sg`. Flagged for the user: reusing a previous MP's
    *code* is prohibited by the brief, and a personal provider credential is not
    code, but if the course issues keys per project this one should be replaced.
  - `src/server/test-plan-ai.ts`: `validateTestPlanReply` validates case by
    case. Unusable cases are dropped, the usable ones are kept, the list is
    capped at the stored limit and a count of discards is appended to the
    reply. Only a plan with no usable case left is an `invalid_schema` failure.
    A blank `preconditions` string is now treated as absent. The instructions
    gained an explicit one-sentence rule for the expected result, an
    instruction to omit empty preconditions, and a statement that a case
    exceeding a limit is discarded.
  - `src/tests/soc-live.manual.test.ts`: new opt-in suite, two calls, gated on
    `SPECFORGE_LIVE_AI=1` plus a key and model so it cannot run in CI or during
    an ordinary `npm test`.
  - Guides: a live-check command and an Observed provider behaviour section in
    the developer guide, a Discarded suggestions note in the user guide, a
    model-availability warning in `.env.example`, and a corrected state
    paragraph in `AGENTS.md`.
- Tests/checks: command, expected and observed result; RED/GREEN for behavior
  changes:
  - `GET /v1/models`: 200, 20 models listed, both `qwen3.5:9b` and `gemma4:26b`
    present.
  - RED, and the reason this session existed. With `SOCLAAS_CHAT_MODEL` set to
    `gemma4:26b` (the model this project's example file suggested first), both
    features failed with `upstream_http` / HTTP 503 in under 90ms. The raw body
    was `no healthy provider backends for backend group "79"`: the model is
    listed but not served. Switching to `qwen3.5:9b` fixed it. So presence in
    `/models` is not availability, and nothing in the deterministic test suite
    could have caught this.
  - RED. On `qwen3.5:9b` the PM chat turn succeeded in 7.2s, and the test plan
    generation failed `invalid_output` / `invalid_schema`. Captured raw output
    showed a well-formed plan of six cases in which one case's expected result
    ran far past the 500-character stored limit, and `preconditions` was sent as
    `""` rather than omitted. The whole-plan schema meant one overrun case threw
    away five usable ones.
  - GREEN. After the change: live run observed 5 cases kept, kinds
    happy,happy,edge,edge,failure, with the reply ending "1 further suggested
    case was discarded for exceeding the stored limits." So the same provider
    behaviour that previously produced a total failure now produces a usable
    plan and an honest message.
  - `npx vitest run src/tests/test-plans.test.ts`: 23 passed, up from 19. Four
    new cases cover keeping usable cases while discarding overruns, the
    singular wording, capping an over-long plan at the stored limit, failing
    only when nothing survives, and treating blank preconditions as absent. The
    "more cases than the stored limit allows" row was removed from the
    invalid-output table because that input is now capped rather than refused.
  - `npm run verify`: observed green. 108 passed, 61 skipped, build successful.
  - One live attempt returned HTTP 502 after 60.1s and the retry succeeded, so
    the provider is intermittently unavailable independent of our code.
- Agent dispatches: role, scope/context supplied, result and handoff: none. The
  security specialist and independent reviewer remain owed on the Developer AI
  slice, and this session changed that slice's validator, so the review should
  cover this change too.
- Review findings, resolution and retries: no independent review. The two
  defects above were found by running the real provider, not by review or by
  the deterministic tests, which passed throughout.
- Resource measurements: elapsed time, tool/dispatch/retry counts, optional
  tokens/cache; unavailable if not captured: roughly 20 tool calls. Provider
  calls this session: 11 in total, of which 5 were one-line model probes, 2 were
  a raw endpoint inspection and 4 were feature calls through the application's
  own providers. A 12-case plan request cost 472 prompt and 490 completion
  tokens. Zero hosted Supabase operations. Token and cache figures for the
  assistant itself were not captured.
- Remaining work / next action (use as a handoff only if unfinished):
  1. Decide whether `gemma4:26b` is worth a fallback path. There is an unused
     `SOCLAAS_FALLBACK_CHAT_MODEL` in the example file and no code reads it; a
     single fallback on 503 would have hidden this outage, which is a design
     decision, not an oversight to fix silently.
  2. The browser spec for the test plan panel is still unwritten, and it should
     now also cover the discarded-case message.
  3. Security specialist and independent code reviewer on the Developer AI
     slice, including this validator change.
  4. Hosted deployment is still unverified: no Vercel or Supabase project, no
     `dev` branch, GitHub Pages not enabled.
