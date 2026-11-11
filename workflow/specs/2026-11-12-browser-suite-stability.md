# Browser suite stability and speed

Status: approved by the user on 2026-11-12.

## Problem

The 53 Playwright journeys in `src/tests/browser/` are not reliably fast or
stable. One recorded full run took 18.6 minutes, single tests took minutes, and
four tests failed but then passed on focused reruns. A run on 2026-11-12 passed
all 53 tests in 2.7 minutes. So the suite can pass, but a run sometimes slows down
or fails for timing reasons. Developers stop trusting a suite like that. Causes
found in the code:

- Playwright starts `next dev`, which compiles each route the first time it is
  visited and recompiles when files change during a run.
- The suite runs one test at a time (`workers: 1`, `fullyParallel: false`).
- Six fixed `waitForTimeout` sleeps stand in for real conditions. Four of them
  test timers (a banner's lifetime, the autosave debounce) on the real clock.
- CI has no retries and records no traces, so a timing failure fails the job and
  leaves nothing to diagnose it with.

`next dev` cannot simply be swapped for a production build. The fake AI adapter
in `src/server/runtime.ts` only works when `NODE_ENV` is `development`, which is a
deliberate guard that keeps the fake provider out of production.

## Behaviour

Work in phases. Each phase is measured and kept only if it helps.

1. **Baseline.** Run the full suite three times locally and once in CI, using
   Playwright's JSON reporter. Record total time, the slowest ten tests and any
   failures. Keep the summary in the session log. Every later phase compares
   against this baseline.
2. **Diagnostics in CI.** Set `retries: 1` in CI only, with
   `trace: "on-first-retry"`, and upload traces together with the HTML report. A
   test that passes on retry is reported as flaky and is not hidden: the job
   summary lists flaky tests. Local runs keep `retries: 0`.
3. **Remove fixed sleeps.**
   - Replace the four timer sleeps (`membership.spec.ts` banner lifetime,
     `requests.spec.ts` and `delivery.spec.ts` debounce waits) with Playwright's
     `page.clock`, so timers advance on demand instead of in real time.
   - Replace the two "let the stale continuation reach React" sleeps in
     `delivery.spec.ts` with waits on an observable condition.
   - Add an ESLint rule that disallows `waitForTimeout` in
     `src/tests/browser/`.
4. **Warm up the dev server.** Before any test runs, a Playwright `globalSetup`
   requests each app route once, so compiling routes is not counted against
   individual test timeouts. Document that browser runs must not overlap with
   source edits.
5. **Run in parallel.** Each test already creates its own users, organisations and
   tickets with random IDs, and the email inbox is filtered by unique address.
   Try `workers: 2` and then `workers: 4` with `fullyParallel: true`. Put any test
   that turns out to share state in a serial `describe`. Keep the highest worker
   count that runs five consecutive times without failures. Fall back to 1 if
   none does.

## Acceptance criteria

- Five consecutive full local runs and two CI runs finish with no failures and
  no flaky (retried) tests.
- The median full-run time is no slower than the baseline. The target is at least
  30% faster than the baseline median, or a measured explanation of why not.
- No `waitForTimeout` remains in `src/tests/browser/`, and lint enforces it.
- CI uploads traces for retried tests, and the job summary names flaky tests.
- The browser test section in the Developer Guide describes the clock, warm-up,
  parallel and retry behaviour.
- No journey loses coverage: the same 53 tests and the same assertions remain,
  apart from the replaced sleeps.

## Permissions and failures

Test infrastructure only. The fake AI guard in `src/server/runtime.ts` is not
changed, and browser tests still require the disposable local stack and the
local-only origins. Retries are diagnostic. A test that needs a retry counts as a
failure for these acceptance criteria.

## Exclusions

- Running browser tests against a production build. That needs a change to the
  fake AI guard, which is security-sensitive and would need its own spec and a
  security review.
- Sharding CI across machines.
- Cross-browser runs.
- Rewriting journeys for speed beyond removing the sleeps.

## Module and test boundaries

- Changes are limited to `playwright.config.ts`, a new
  `src/tests/browser/global-setup.ts`, the six spec sites that use sleeps,
  `eslint.config.mjs`, `.github/workflows/ci.yml` and the Developer Guide.
- Evidence is timed suite runs recorded in the session log. There is no new
  application test seam.
