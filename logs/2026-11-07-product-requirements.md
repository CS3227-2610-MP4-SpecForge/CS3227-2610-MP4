# Session summary: 2026-11-07 / initial product requirements

Human verification: pending
Revision or working diff reviewed: working tree based on 223efba; approved
product specification and first account/organisation implementation slice.

- Requests: define an achievable SpecForge PM MVP through the installed
  grill-me/grilling interview; retain the lightweight workflow; defer stack and
  code. Read AGENTS.md, workflow README, architecture and UI policies.
- Agreed decisions: conversational AI clarification, six editable request fields,
  PM-controlled submission and revisions, editable published requests with
  timestamps, author-private autosaved drafts/conversations, organisation-wide
  submitted visibility. Multiple organisations, independent admin status,
  invitations and last-admin protection. Fixed account roles and usernames;
  username/password signup without email or recovery. Partner owns Developer AI.
- Changes: drafted workflow/specs/2026-11-07-product-mvp.md; the user explicitly
  approved it, and its status now records that approval.
  Applied grilling and SpecForge security guidance. No stack/scaffold changes.
- Checks: read source guidance and inspected repository status/file inventory.
  Documentation consistency check follows writing. No runtime/test commands
  exist and no application tests or passing security controls are claimed.
- Agent dispatches/reviews/retries: none. Independent implementation reviews
  remain required at the applicable future boundaries.
- Resource measurements: elapsed time, tokens/cache and provider usage metrics
  unavailable. No live SoC calls; no subagent dispatches.
- Remaining: user verifies this summary; stack discussion and SoC capability
  investigation follow product approval. Developer AI and
  product-website details need separate definition. No implementation approval
  or assignment completeness is claimed. Stack research uses official product
  documentation; framework familiarity and the partner's existing choices are
  requested before narrowing recommendations.
- Stack discussion: user reports both students are comfortable with any stack
  and neither has chosen one. Provisional recommendation: Django/PostgreSQL,
  Django templates with HTMX and shared Tailwind tokens; hosting subject to
  budget and SoC reachability. These choices are not yet approved. Official
  Supabase password-auth docs describe email/phone identities, making the
  agreed username-only flow a less direct fit. Public SoCLaaS documentation
  advertises an OpenAI-compatible interface; actual course endpoint, limits and
  deployment reachability still need verification. No credentials were read.
- Subsequent steering: user selected React, Supabase and email accounts,
  superseding username-only authentication, and requested review of public
  Homebrew reference repository. Downloaded a read-only reference copy under
  /private/tmp; inspected commit efb6ed97fe86d179a6b38c126374c4a2916b22a3,
  package manifest, auth/demo provisioning, SQL, UI, guides and deployment
  workflow. It uses Next.js server handlers plus Supabase Auth/Postgres and
  generates confirmed email-shaped demo identities with once-shown passwords,
  isolated seeded workspaces and bounded provisioning. No reference tests or
  deployed service were exercised; no credentials or live providers accessed.
  The product spec records this later direction; verification/recovery and
  SpecForge demo-kit details remain to settle. Reference project instructions
  were not adopted as this repository's workflow.
- User confirmed ordinary signup requires email verification, with preconfirmed
  generated demo accounts for peer testing. Consolidated the specification's
  identity, invitation and testing requirements to remove superseded username
  rules. Password recovery remains excluded; exact demo kit, runtime and hosting
  remain undecided. Documentation whitespace check passed; no code implemented.
- User approved Next.js and the proposed kit (isolated organisation, PM admin,
  Developer, sample requests), required free hosting and asked to defer provider
  selection. Read their pasted SoCLaaS guide without accessing credentials.
  Recorded supplied endpoints separately from unverified access/model/limit
  assumptions. Hosting choice can follow initial development, with an early
  compatibility check; verified current official documentation for Next.js
  deployment, Supabase free-project capacity/pausing and SMTP restrictions.
  Ordinary verification requires a suitable email-delivery setup; demo kits
  avoid email delivery but do not validate ordinary signup. No implementation,
  hosted provisioning, live SoC request or deployment performed.
- User requested environment skeletons before supplying a project SoC key.
  Created .env and .env.example with empty SoCLaaS/Supabase credential slots,
  the supplied SoCLaaS base URL, and unset model choices. Added .gitignore rules
  excluding .env and environment variants while allowing .env.example. No real
  secrets were supplied or read. Verified ignore behaviour and placeholder-only
  configuration without printing values; no provider calls or runtime checks.
- After the user supplied the key locally, made one authenticated GET /models
  request to the allowlisted SoCLaaS base URL with a 30-second timeout and bounded
  response size. Discovery succeeded and listed models including gemma4:26b and
  qwen3.5:9b. No credential values or raw error bodies were printed. No generation
  call was made; chat capability, latency, quotas and deployed-host reachability
  remain unverified. Model configuration remains unchanged.
- User configured Qwen and asked for the next step. Ran two bounded synthetic
  Chat Completions probes (600 output tokens, 45-second timeout each, no automatic
  retries). First: HTTP 200, 10.16 seconds, finish_reason=length, no visible
  content; provider reported 134 prompt/600 completion/734 total tokens. Second
  diagnostic added reasoning_effort=none: HTTP 200, 5.76 seconds,
  finish_reason=stop, visible content; provider reported 136 prompt/280
  completion/416 total tokens. Strict direct six-field JSON validation failed
  for both. This establishes connectivity, not production-ready structured
  output or whether the model internally honours every optional parameter.
  No real user data, raw responses or secrets logged; environment unchanged.
  Next: security preflight and first-slice concrete interfaces, then TDD;
  AI adapter must validate output and reject truncation/invalid responses.

## Authorised first implementation slice

- User request: proceed with the proposed Next.js/Supabase scaffold, verified
  accounts and initial organisation workflow. Main agent implemented; no workflow
  reinstallation, commit, push, hosted migration or deployment.
- Files: source, tests, local tooling and Supabase configuration/migration under
  src/; required package/framework configs at root; current User/Developer Guides
  and initial Reflections under docs/. Updated architecture/UI/current-state
  guidance. The Next.js dev command also generated its installed-guide notice
  in AGENTS.md; relevant installed route/cookie/CSP documentation was inspected.
- Working behaviour: fixed PM/Developer signup, emailed OTP verification,
  sign-in/out, resend; organisation create/list/select with creator admin.
  RLS and the creation RPC enforce verified membership independently of Next.js.
  Shared React forms/shell/CSS tokens support both roles. Invitations, member
  management, demo provisioning and AI request workflows remain unimplemented.
- Test seams: concrete routes and local database/browser interfaces recorded in
  the existing approved product spec. TDD RED cases included missing routes/RPC,
  absent auth rate cap and wrong provider-error statuses; focused GREEN followed
  each implementation. No tests were written against private implementation helpers.
- Preflight: one security specialist, scoped to the approved spec and first slice,
  returned ten concrete requirements; verified identity, immutable profile role,
  actual database confirmation checks, atomic creation, RLS, bounded input,
  trusted Origin and server-only SSR sessions were implemented.
- Code review: one independent reviewer found protected getUser outages mapped
  to401; first fix added503 regression/classification and origin/CSP hardening.
  Re-review found the analogous429 case; second fix added its regression and
  sanitized429 response. Both RED failures were reproduced before their fixes.
  Final verdict approved, no remaining blocking code/architecture findings.
- Security post-review: approved for local first slice; targeted follow-up
  confirmed origin/CSP/outage fixes. The last429 response mapping was checked by
  the code reviewer. No hosted deployment/security completeness claimed.
- Final evidence: npm run verify passed lint, TypeScript,16 HTTP tests and the
  production build. Its six database cases were explicitly skipped there;
  npm run test:integration separately passed all six against actual disposable
  local Supabase. Browser rerun and final output checks recorded below.
- Earlier browser evidence: both role journeys plus shared keyboard/mobile check
  passed (three Chromium tests). Initial failures were a test navigation race
  between signup/verification; waiting for the new screen corrected the test.
  Screenshots of workspace desktop/mobile and account screen were visually
  inspected for consistent controls/tokens and layout.
- Setup/rework: Docker initially stopped and was started. Latest CLI3 rejected
  legacy inbox config; pinned compatible CLI2.121.0 in lockfile. Audit initially
  reported eight moderate development dependency findings through minimatch;
  targeted patched-version override reduced npm audit to zero vulnerabilities.
  A local CLI diagnostic printed disposable development credentials once;
  new database wrappers suppress raw credential-bearing CLI output. No SoC or
  hosted key was printed. Ignored .env.local targets local Supabase and leaves
  the user's .env and SoC configuration unchanged.
- Review resources: two specialist agents, six review turns total (security
  preflight/post-review/targeted follow-up; code review/two fix reviews). Reviewers
  were read-only, received scoped paths/evidence, did not dispatch children or
  read credentials. No live SoC calls in implementation. Token/cache/elapsed
  savings and aggregate tool counts were not measured.
- Limits/release gates: free hosting and automation remain undecided/unconfigured;
  hosted HTTPS cookies, SMTP/templates, Auth limits and deployed SoC reachability
  remain unverified. Auth's coarse process-wide cap supplements provider limits;
  deployment-wide abuse strategy remains a release gate. Inline CSP and100-row
  local list cap are documented. Password recovery remains excluded.
- Final browser rerun passed all three Chromium tests after the reviewed fixes.
  A screenshot-only hydration warning was traced to Playwright's automatic
  caret-hiding style injection; screenshots now preserve caret styling and the
  keyboard/mobile test asserts no hydration warning. The final run had none.
  Lint and route-type generation/TypeScript checks passed after this test-only
  change. Final git diff whitespace and .env/.env.local ignore checks passed.
  Summary still requires human verification before submission.
- User reports local manual testing and verification passed after clarification
  that verification emails are captured in the local inbox. Exact manual test
  cases were not enumerated; this is user-reported manual evidence, separate
  from the automated checks above. It does not imply verification of this full
  log, hosted email delivery or deployment. Recommended next slice: organisation
  invitations and membership/admin management from the approved MVP.
