# 2026-11-12: Server failure logging (MP3 feedback workstream A)

- Changes: `logFailure` and `serviceUnavailable` in `src/server/http.ts` write
  one JSON `console.error` line per unexpected failure. The line is built only
  from allowlisted fields: method, route pattern, status, error class, validated
  code, Auth upstream status and the strict AI diagnostic. It is wired into the
  `createApplication` catch-all, every 503 in the handlers, the invalid-origin
  503 in `runtime.ts`, and AI provider failures inside chat and test plan turns.
  Logging AI failures that still return HTTP 200 goes slightly beyond the
  spec's literal wording; it is the only place the AI diagnostic exists.
  Responses are unchanged, and expected 4xx outcomes log nothing. See
  [workstream A of the spec](../workflow/specs/2026-11-12-mp3-feedback-improvements.md)
  and the Developer Guide's "Security and deployment gates".
- Validation: `src/tests/failure-logging.test.ts` (13 tests) covers:
  - a forced exception, which produces exactly one line;
  - a sentinel email, ticket text and IDs, which appear in no log line;
  - 400, 401, 403, 404, 409, 413 and 429 responses, which log nothing;
  - adversarial routes and hostile error objects;
  - AI failures in both chat and test plans.

  `npm run verify` passed. The `runtime.ts` origin path has no unit test,
  because it imports `server-only` and `next/headers`. Database and browser
  suites were not run, because no database or UI behaviour changed.
- Review: the security preflight asked for:
  - a logger that never throws;
  - a fixed fallback route for unknown paths;
  - a method allowlist;
  - no conflation of local and upstream status codes.

  All four are implemented and tested. The code review found that the
  invalid-origin 503 was not logged; it is now fixed.
- Open: log lines are not rate-limited, so an upstream outage logs one line per
  failed request. This is documented as a residual risk.
