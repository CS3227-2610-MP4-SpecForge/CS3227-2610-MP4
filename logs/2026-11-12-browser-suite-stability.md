# 2026-11-12: Browser suite stability

- Changes, per [the spec](../workflow/specs/2026-11-12-browser-suite-stability.md):
  - Replaced all six fixed `waitForTimeout` sleeps:
    - The banner-lifetime and autosave-debounce checks use `page.clock.runFor`.
    - The stale-response checks use a new `settleAfter` helper.
    - Lint now rejects `waitForTimeout` in browser tests.
  - Fixed a flaky layout check in the banner journey: it read the invite field's
    position once, while the modal could still be re-rendering.
  - Added a global setup that compiles every page before the tests run.
  - CI now retries a failed test once with a trace, lists failed and flaky tests
    in the job summary, and uploads traces.
  - Added `SPECFORGE_TIMING_FILE` (a JSON report for timing comparisons) and the
    `SPECFORGE_BROWSER_WORKERS` measurement knob, and documented both in the
    Developer Guide.
- Validation:
  - Baseline: three full runs took 170.7s, 160.4s and 147.9s (median 160.4s).
    The third run had one flaky failure, the layout race now fixed.
  - After the changes: seven consecutive full runs on one worker passed all 53
    tests each time: 147.3s and 144.7s in the worker trial, then 146.0s, 144.0s,
    151.4s, 150.3s and 150.7s. The median is 147.3s, about 8% faster than the
    baseline. The banner journey dropped from about 13s to 1.1s.
  - Mutation checks failed the converted tests when published edits autosaved or
    when the banner lifetime was doubled. A first version of the banner checks
    let a doubled lifetime pass, because the installed clock still runs in real
    time; giving the expiry checks a 1s timeout fixed that.
  - `npm run verify` passed: 190 tests, with database tests skipped.
  - CI runs were not observed: nothing has been pushed.
- Parallel workers: two and four workers failed, consistently at sign-in. The
  app's process-wide auth admission limit of 30 sign-in or sign-up requests per
  minute (`createAuthAdmission`) rejects the extra attempts. Supabase's own limit
  was ruled out: 60 rapid local token requests returned no 429. The spec's 30%
  target therefore needs a decision on that security control, so the suite stays
  on one worker.
- Review: The registered `code-reviewer` approved the final diff in a separate session, and the review gate recorded the approval.
- Open: decide whether browser tests may avoid UI sign-in, or the local test
  stack may raise the auth admission limit, so the suite can run in parallel.
