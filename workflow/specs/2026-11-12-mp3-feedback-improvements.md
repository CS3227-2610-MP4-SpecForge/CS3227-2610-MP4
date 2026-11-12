# Improvements from the MP3 feedback

Status: approved by the user on 2026-11-12, with these decisions:

- Sign-in rate limit: document the per-instance limit (workstream D, option a).
- Diagrams: Mermaid, rendered on the Pages site by a layout include
  (workstream F).
- Session expiry: show a persistent banner and keep unsaved work, with no
  automatic redirect (workstream B).

Approval covers the whole plan; each workstream still gets its own review,
session log and commit. A session taking over should pick the next workstream
in the suggested order, check its evidence against the current checkout, and
start from its acceptance criteria.

## Problem

The MP3 feedback report criticised the team's previous project on points that
also apply to SpecForge. These points are independent of MP3's own features.
Some are already fixed: there are browser and component tests, database tests
run in CI, there is lint and a separate development environment, and AI limits
cover both roles. The release documentation was brought in line with the
deployed state in commit `4c0c74f` (see `logs/2026-11-12-doc-drift.md`).

What remains, with evidence from the 2026-11-12 survey:

- **Unexpected server errors are never logged.** The catch-all in
  `src/server/application.ts` (near the end of `createApplication`) returns 503
  and records nothing. There is no `console.error` anywhere in `src/server/`.
  The same applies to RPC failures mapped to 503 in `requests.ts`,
  `delivery.ts`, `chat.ts` and `test-plans.ts`.
- **Session expiry is handled differently in each component.** `workspace.tsx`
  redirects only on 401, `profile.tsx` on 401 or 403, `request-list.tsx` clears
  the page, `request-editor.tsx` shows a "denied" problem, `ticket-delivery.tsx`
  blocks the control, and `use-assistant.ts`, `test-plan-panel.tsx`,
  `ticket-activity.tsx` and `membership.tsx` show only the error text. MP3 was
  marked down for asking a user to sign in while their workspace still looked
  usable.
- **Release checks cannot tell which version is running.** `deploy.yml` records
  the URL and stops. There is no health endpoint, no record of which revision
  was deployed, and no check that the database and AI settings work on the
  deployed app.
- **The sign-in rate limit only holds within one process.**
  `createAuthAdmission` keeps its count in memory, so on Vercel each serverless
  instance has its own allowance. The Developer Guide calls it process-wide but
  does not spell out what that means on Vercel.
- **The code is hard to read.** 305 lines outside the tests are longer than 140
  characters, the worst being in `request-editor.tsx`, `soc.ts`,
  `ticket-delivery.tsx` and `chat-panel.tsx`. `workspace.tsx:57` puts a whole
  list render on one line. `application.ts` routes every account, organisation,
  membership and profile request through one function of regular-expression
  branches. There is no formatter.
- **The guides are hard to use.** Neither guide has a table of contents,
  diagrams or screenshots, and there is no step-by-step walkthrough. The
  Developer Guide puts sections in the order features were built, with "Email
  assignee picker" after "Process", and it embeds long SoC experiment write-ups
  that belong in `logs/`.
- **`docs/Reflections.md` stops at the two-field AI workspace.** It has no
  AI-security section, nothing on the security of the development agents, and no
  discussion of what validation cannot guarantee. The product spec asks for
  multi-agent, context and resource experiments.
- **Release evidence is scattered.** 23 of 37 session logs say "Human
  verification: pending", and nothing maps each feature to its spec, tests and
  logs.
- **Some empty states don't help.** "No requests yet." is the same for PMs and
  Developers. The test plan panel shows "No test plan yet." without checking
  whether loading failed.
- **Commits are uneven.** Messages switch between conventional prefixes and
  plain sentences, some commits bundle unrelated changes (`6119557` adds a test
  tier and fixes Accept all), and "fix:" messages do not always say what the
  corrected behaviour is.

## Outside this spec (user actions)

These need the user's accounts and are not agent work. Later steps depend on
them.

1. **Vercel is blocked.** Both URLs return HTTP 402 `DEPLOYMENT_DISABLED`, and
   the 2026-11-11 development deploy failed with "Your Team exceeded our fair use
   limits and has been blocked". Resolve this in Vercel or choose another host.
   Hosted checks in workstream C cannot pass until it is fixed.
2. Add a required reviewer to the `production` GitHub Environment, then restore
   the reviewer wording in the Developer Guide and `deploy-production.yml`.
3. Check each Supabase project's Site URL, custom SMTP and Auth rate limits
   (workstream D), then run one hosted
   sign-up, ticket and AI journey per role. The 2026-11-10 deployment log
   records that nothing hosted beyond the sign-up page has been tried.
4. Confirm the production Vercel project's name. The Developer Guide's
   first-time setup step 3 says `specforge`, but the URL is `specforge-prod`.

## Workstreams

Each workstream is independent unless a dependency is stated. Suggested order:
A, B, C, then D to H. A, B, C, E and H change `src/`, so each needs the
`code-reviewer` subagent on its exact diff before committing (see `AGENTS.md`).
D, F and G are documentation. Run E when no other `src/` work is open, because
its reformat touches nearly every file.

### A. Server failure logging

Behaviour:

- Add one helper, for example `logFailure(context, failure)` in
  `src/server/http.ts`, that writes one structured line through `console.error`.
  Vercel collects function logs.
- The line carries: the HTTP method; the route *pattern* with IDs replaced
  (for example `/api/organisations/:id/members`); the error class name; any
  PostgreSQL or PostgREST `code` and HTTP `status`; and, for AI, the existing
  allowlisted diagnostic.
- It never carries request or response bodies, ticket text, prompts, AI output,
  cookies, headers, emails, keys or raw error messages. Supabase messages can
  quote values, so messages are excluded by construction rather than by
  redaction.
- Call it in the catch-all and wherever an unexpected failure becomes a 503.
  Expected outcomes (400, 401, 403, 404, 409 and 429) are not logged.

Acceptance:

- A handler test that forces an unexpected exception sees exactly one log call
  with the allowlisted fields. A test using a sentinel value (for example a
  fake email and ticket text in the request) shows that the sentinel appears in
  no log output.
- Expected 4xx paths log nothing.
- Response bodies and statuses are unchanged; existing tests still pass.

### B. Consistent session expiry

Behaviour:

- `src/components/http.ts` gets one shared signal for "signed out": a 401 from
  any `api` call. A 403 continues to mean "no permission for this" and is
  handled in place.
- A `SessionProvider` in the root layout listens for that signal. It shows a persistent, non-modal banner, "Your session has ended. Sign
  in again to continue.", with a **Sign in again** link.
- It does not redirect automatically, so unsaved ticket text stays on screen.
  The existing departure guard warns before leaving. The workspace and profile
  pages keep their redirect because they hold no unsaved work.
- Components stop special-casing 401 except to stop retrying.

Acceptance:

- A component test shows that a 401 from any call shows the banner once and
  leaves the editor's text in place.
- A browser test signs out in a second tab, then edits a ticket in the first.
  The banner appears, the typed text is still there, and following the link
  triggers the departure guard.
- A 403 still shows the existing in-place message.

### C. Release identity and post-deploy checks

Behaviour:

- `GET /api/health` is public and uncached. It returns
  `{ status, revision, database, ai }`:
  - `revision` is the commit SHA built into the app.
  - `database` is `ok` or `unavailable`, from one cheap read with the public
    key and a 3-second deadline.
  - `ai` is `configured` when the three SoC settings are present and name an
    enabled model. It never makes a model call.
  - The response never includes keys, URLs, model IDs or error text.
  - It returns 200 when the database is reachable and 503 otherwise.
- Because `deploy.yml` moves `.git` aside, the build cannot read the SHA from
  Vercel's Git variables. Pass `${{ github.sha }}` into `vercel build` as a
  build-time environment value instead.
- A new final step in `deploy.yml` polls the deployed URL's `/api/health` for
  up to 3 minutes. It passes only when `revision` equals `GITHUB_SHA`,
  `database` is `ok` and `ai` is `configured`. Otherwise the job fails with a
  clear message, which also catches an old deployment still answering.
- Health requests are exempt from the origin check only because they are GETs,
  which already skip it. No other exemption.

Acceptance:

- Handler tests cover the healthy case, an unreachable database (503), missing
  AI configuration (`ai: "missing"`), and a check that the response contains
  no key, URL or model value.
- The workflow step is checked by running the polling script against a local
  `next start` with a mismatched and then a matching revision; record both
  results.
- Live confirmation depends on user action 1.

### D. Truthful sign-in rate limit

Decision: (a) document the per-instance limit accurately and rely on Supabase
Auth's limits as the real control. Moving admission into PostgreSQL was
rejected: it needs a function callable by anonymous users, which is a new
attack surface for little gain.

- The Developer Guide says the cap applies per server instance, so on Vercel
  the effective limit grows with the number of instances.
- Record the hosted Supabase Auth rate limits as part of user action 3.

### E. Readability and formatter

Behaviour:

- Add Prettier with `format` and `format:check` scripts. Add `format:check` to
  `npm run verify` and therefore to CI.
- Settings: print width 120 and the existing double quotes. Let Prettier break
  up one-line blocks instead of hand-editing them.
- Apply the reformat in one commit that changes no behaviour. List that commit
  in a new `.git-blame-ignore-revs`. Do it when no other branch has open
  changes under `src/`, and coordinate before running it.
- In a separate commit, split `application.ts` routing into
  `server/auth.ts`, `server/organisations.ts` (including membership and
  invitations) and `server/account.ts`. Use a small route table:
  `{ method, pattern, handler }`.
- Keep `createApplication` as the composition point and keep the order of the
  origin check, auth admission and identity check. HTTP behaviour must not
  change.

Acceptance:

- After formatting, `npm run verify`, `npm run test:integration` and
  `npm run test:e2e` all pass.
- The split leaves `src/tests/application.test.ts` and the membership database
  tests passing without edits beyond import paths.
- No line outside the tests is longer than the print width, except strings
  Prettier cannot wrap.

### F. Usable guides

Behaviour:

- **Developer Guide:**
  - Add a table of contents.
  - Regroup into Setup, Architecture, Data model, Security, AI features, Testing,
    Deployment and Process.
  - Add three Mermaid diagrams: the module and request flow (browser → route →
    application handlers → Supabase RPC/RLS and the SoC adapter); an
    entity-relationship diagram of organisations, members, invitations,
    requests, activity, chat turns, test plan turns and test plans; and a
    sequence diagram of one PM AI turn from admission through provider and
    validation to completion, including refunds.
  - Move the SoC experiment narratives into links to their existing logs, keeping
    one short "Observed provider behaviour" summary.
  - Add a short endpoint reference table: method, path, who may call it, and
    the main status codes.
- **User Guide:**
  - Add a table of contents.
  - Add a five-minute walkthrough: create two accounts (PM and Developer), create
    an organisation, invite the Developer, draft a ticket with AI, review a
    change, publish, assign, then generate and save a test plan.
  - Add screenshots of the key states: empty workspace, ticket editor with the AI
    sidebar, change review, test plan panel, and an AI failure with Details.
- **Screenshots** come from a script, `src/tooling/screenshots.mjs`, using
  Playwright against the local stack with the existing fake AI, so they can be
  regenerated. They are saved to `docs/images/`.
- **Pages site:** update `pages.yml` to copy `docs/images/`, and add a Mermaid
  include to the site layout (Mermaid is already rendered on GitHub itself).

Decision: Mermaid, rendered in the browser on the Pages site; no pre-rendered
SVGs. Load the Mermaid script with an exact pinned version.

Acceptance:

- Every link and anchor resolves.
- The diagrams render on GitHub and on a local Jekyll or Pages build.
- The screenshot script runs on a fresh local stack.
- Everything the walkthrough tells the reader to do exists in the app.

### G. Reflections, acceptance index and commit practice

Behaviour:

- **Reflections:** the agent drafts new sections from the logs and specs, and
  the user rewrites them in their own voice. Reflections are graded personal
  work, so the agent does not present its draft as final. Sections:
  - AI security across both features, with the tests that exercise each control
    (for example the injection case in `src/tests/test-plans.test.ts`).
  - Security of the development agents, with concrete evidence: review-gate hook
    tests (`logs/2026-11-12-review-gate.md`), redaction of credentials in CI
    output, keeping secrets out of the transcript during deployment, and
    instructions found in tools treated as data.
  - Limits of validation: a well-formed proposal can still invent or drop
    requirements, which is the reason for human review.
  - Multi-agent work, context engineering and resource-aware use, as the
    product spec requires.
- **Acceptance index:** add `docs/AcceptanceIndex.md`, a table of feature →
  spec → main tests → session log(s) → hosted-verification state. Link it from
  the README and the site. Mark features whose hosted check is still pending
  instead of claiming acceptance.
- **Commit practice:** add a short section to `workflow/README.md`:
  conventional prefixes, one purpose per commit, and a "fix:" message that
  states the corrected behaviour.

Acceptance:

- Every spec under `workflow/specs/` appears in the index, or is marked
  historical or superseded.
- Links in the index resolve.
- Reflections claims cite a log, spec or test that exists.

### H. Helpful empty states

Behaviour:

- **Requests list with no tickets:** PMs see "No tickets yet. Select **New
  task** to draft one; it stays private until you publish." Developers see "No
  published tickets yet. Tickets appear here when a Product Manager publishes
  them."
- **Test plan panel:** shows "No test plan yet" only after a successful load
  with no plan. A failed load shows its error and **Retry** instead.

Acceptance:

- Component or browser tests cover each role's empty state, and the
  failed-load case showing the error rather than the empty text.
- The UI follows `workflow/ui.md` tokens and components.

## Permissions and failures

No permission, RLS or storage change is planned. Workstream C adds one public
read-only endpoint whose output is limited as described. Workstreams A and C
touch security-sensitive surfaces (logs and a public endpoint), so they need a
security preflight and review under `workflow/README.md`.

## Exclusions

- No new product features, AI behaviour changes or prompt changes.
- No migration to a different host. That is the user's decision in action 1.
- No automatic retries or live SoC calls in CI.

## Testing interfaces

- Server: `createApplication` with fake providers (`src/tests/application.test.ts`
  pattern), and a spy on `console.error` for workstream A.
- Client: Vitest component tests through `renderComponent` in
  `src/tests/render.tsx`, plus Playwright journeys in `src/tests/browser/`.
- Deployment: the polling script run locally against `next start`.
- Docs: link and anchor checks, plus a local Jekyll or Pages build for diagrams
  and images.
- At the end of each workstream run `npm run verify`. Also run
  `npm run test:e2e` for B, E and H, and `npm run test:integration` for E.
