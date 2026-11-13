# 2026-11-12: MP3 feedback spec close-out

- Changes: a final check of
  [the MP3 feedback spec](../workflow/specs/2026-11-12-mp3-feedback-improvements.md)
  against the checkout before merging. Workstreams A to H meet their acceptance
  criteria locally. The spec now records that, and notes that the Render move
  ([log](2026-11-12-render-hosting.md)) superseded user actions 1 and 4. The
  Developer Guide's Security section records the health endpoint's accepted
  disclosure and unthrottled probe.
- Review: the spec requires a security review for A (logging) and C (public
  health endpoint). Both had a preflight and code review, but no separate
  security review afterwards, so one ran now on the current code, including the
  Render deploy script. It approved with no blocking issues; the log line is
  built only from allowlisted fields and cannot carry attacker text, and the
  endpoint returns only fixed words and a validated SHA. Residual risks: the
  health probe and failure logs are unthrottled, the endpoint deliberately
  discloses build and dependency state, and the deploy workflows accept manual
  runs on any branch while the GitHub Environments have no branch restriction
  or reviewer. Its suggestion to pass workflow inputs through `env:` rather than
  inline `${{ }}` is not applied; today both callers pass fixed values.
- Validation: GitHub renders all three Developer Guide diagrams on the pushed
  `pm-features` branch, which closes the last open render check for F. The
  security reviewer reran the logging and health tests (28 passed).
- Open:
  - F's "the screenshot script runs on a fresh local stack" is unverified: it
    ran on an existing stack only, because a fresh stack means `db:reset`, which
    clears local data.
  - E asked to coordinate before the reformat; no open branch or pull request
    had `src/` changes at the time, so it went ahead without a separate check
    with the team.
  - Hosted checks wait for the first Render deploy, and the Reflections draft
    waits for the author's rewrite.
