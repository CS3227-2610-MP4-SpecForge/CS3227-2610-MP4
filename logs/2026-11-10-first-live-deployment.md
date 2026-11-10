# Session summary: 2026-11-10 / First live deployment

Human verification: pending
Revision or working diff reviewed: branch `feat/deploy-and-pages`, mirrored to
`dev`

- Prompts and requests (sanitized summary of all development interactions): the
  user asked whether the project could be hosted, then asked for the browser to
  be driven while they signed in and supplied credentials. Account creation,
  passwords, tokens and every secret value stayed with the user; no credential
  value passed through the assistant or this log.
- Agreed behavior / specification and decisions:
  - Vercel's own Git integration stays unused; both Vercel projects were created
    empty so deployment is driven only by `deploy.yml`.
  - Development deploys to the production target of a separate Vercel project
    rather than to a preview of the production one, because `APP_ORIGIN` must be
    a single fixed origin and preview URLs change per deployment.
  - No fallback SoC model (decided the previous session) still holds.
- Implementation or documentation changes: `deploy-development.yml` now targets
  the development project's production; `deploy.yml` relays redacted failure
  output, installs the Vercel CLI globally and uses it directly; new
  `vercel.json` declares the Next.js framework; `package.json` engines and both
  workflows moved to Node 22; `database.mjs` relays redacted failures; guides,
  README and `AGENTS.md` updated; `codeql.yml` added so the repository ruleset's
  code-scanning requirement can be satisfied.
- Tests/checks: command, expected and observed result; RED/GREEN for behavior
  changes: five consecutive real failures, each fixed and re-run, ending green.
  1. `supabase db push` failed with the provider output suppressed, so the
     reason was invisible. Both the local tooling and the deploy workflow now
     relay the tail of the output with JWTs, `sb_`/`sbp_` keys, passwords inside
     connection URLs and long opaque tokens redacted. Verified the redaction
     against sample lines before relying on it.
  2. With the reason visible: `FATAL: password authentication failed for user
     "postgres" (SQLSTATE 28P01)`. The `SUPABASE_DB_PASSWORD` secret was wrong.
     Confirmed from the secret's `updated_at` that the retry used the new value
     and still failed, so the password itself was wrong rather than stale.
     Resolved by resetting the database password to a generated one.
  3. `Found invalid Node.js Version: ">=24 <25"`. Vercel's newest supported
     runtime is 22.x, so the declared engine could not be deployed at all.
     Moved local, CI and both environments to Node 22 together, and re-verified:
     `npm run verify` green on Node 22.23.4, 108 passed, 61 skipped, build
     successful.
  4. `No Output Directory named "public" found`. An empty Vercel project has no
     framework preset, so a successful Next.js build was then treated as a
     static site. Fixed with `vercel.json` in the repository rather than a
     dashboard setting.
  5. `ENOENT: ... @vercel/next/dist/server-launcher.js`. Installing the CLI into
     the project's `node_modules` let npm dedupe the CLI's builder packages
     against the application's dependencies. Installing it globally fixed it.
  - GREEN, observed: run 42758359478 succeeded. "Migrations applied to the
    development project", build and deploy completed, and
    `https://specforge-dev.vercel.app` returns HTTP 200 and renders the sign-up
    page with the role selector. `https://specforge-prod.vercel.app` returns 404,
    which is correct: production has not been deployed.
  - The browser suite failed once on an unrelated timeout and passed on re-run;
    one CI run failed because the local Supabase stack did not start, and passed
    on the next run. Both were transient, not reproducible.
- Agent dispatches: role, scope/context supplied, result and handoff: none. The
  security specialist and an independent reviewer are still owed on the
  Developer AI slice and on these deployment changes.
- Review findings, resolution and retries: no independent review. Every defect
  above was found by running the real pipeline, not by inspection; none of them
  could have been caught by the test suite, which was green throughout.
- Resource measurements: elapsed time, tool/dispatch/retry counts, optional
  tokens/cache; unavailable if not captured: one session, roughly 90 tool calls,
  zero subagent dispatches, zero SoC LLM calls. Six "Deploy development" runs in
  total. Token and cache figures were not captured.
- Remaining work / next action (use as a handoff only if unfinished):
  1. Merge pull request #2 into `main`, which runs the production deploy. The
     `production` environment has no required reviewer yet; adding one is the
     gate the developer guide describes.
  2. GitHub Pages is still disabled in repository settings, so the product
     website cannot publish. Set Pages to build from GitHub Actions.
  3. Exercise the deployed development app by hand: sign up, create an
     organisation, publish a ticket, run both AI features against SoC LLM
     through the hosted environment. Nothing hosted has been exercised beyond
     the sign-up page rendering.
  4. `docs/Reflections.md` still needs restructuring around Multi-Agent SE,
     Context Engineering and Resource-aware Use.
  5. Security specialist and independent code reviewer on the Developer AI and
     deployment slices.
