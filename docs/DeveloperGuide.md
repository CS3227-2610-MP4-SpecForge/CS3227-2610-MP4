# SpecForge Developer Guide

## Local setup

Requirements: Node.js 24, npm, Docker Desktop running. Dependencies are locked
in `package-lock.json`. Supabase CLI is pinned to the compatible 2.121.0 line;
CLI 3 rejected the legacy inbox configuration during setup.

```sh
npm ci
npm run db:start
npm run db:env
npm run dev
```

Open <http://localhost:3000>. Local Supabase uses API port 55321, database 55322,
Studio 55323 and captured email inbox 55324. Source/configuration/migrations live
under `src/supabase/`. `db:start` applies migrations to a fresh local stack;
`npm run db:reset` reapplies them by clearing **only disposable local data**.
`npm run db:stop` stops the local stack. Wrappers refuse additional arguments and
suppress CLI output that can contain generated local credentials.

`db:env` writes an ignored `.env.local` containing local public Supabase values
and `APP_ORIGIN`. It does not change `.env` or copy a hosted project's key.
Next.js gives `.env.local` precedence over `.env`; remove/replace it deliberately
when switching to a hosted development project. Ordinary app paths do not use
`SUPABASE_SECRET_KEY`. `.env.example` documents future server-only SoCLaaS and
privileged-operation slots; the current slice makes no model requests.

## Modules and interfaces

- `src/server/application.ts`: account/organisation HTTP behaviour. Its small
  request/response interface covers validation, authorisation and safe failures.
- `src/server/runtime.ts`: Next.js/Supabase SSR adapter, request-scoped cookies
  and bounded outbound fetch. Normal calls use the public key and user session.
- `src/app/api/[...path]/route.ts`: binds that interface to Next.js handlers.
- `src/components/`: shared account forms, workspace, form controls, notices and
  client HTTP handling. `src/app/globals.css` owns shared theme tokens.
- `src/supabase/migrations/`: fixed roles, initial profile provisioning, RLS and
  transactional organisation creation, invitations and member administration. Storage authorisation remains effective
  when clients bypass Next.js.
- `src/tests/`: HTTP behaviour tests, real local database integration checks and
  browser journeys. `src/tooling/` holds local-only setup/test adapters.

An organisation creator's account role is independent of admin membership.
`create_organisation(organisation_name)` derives identity from `auth.uid()`,
checks actual Auth confirmation and creates both organisation and admin
membership atomically. RLS uses private security-definer helpers with an empty
search path to avoid recursive membership policies. Clients receive SELECT and
the creation RPC only; they cannot rewrite roles or memberships. Role metadata
is captured once into the protected profile, not trusted on later requests.

Account POSTs are `/api/auth/signup`, `/verify`, `/signin`, `/signout`, `/resend`.
The complete routes have the `/api/auth/` prefix. JSON is bounded to 8 KiB.
`GET /api/account` returns verified account identity and its protected role.
`GET/POST /api/organisations` list/create; `GET /api/organisations/[id]`
selects a member-visible organisation. The membership slice adds the routes below.

## Membership interfaces

The approved [membership slice](../workflow/specs/2026-11-07-organisation-membership.md)
uses the same authenticated HTTP and session-bound database test seams:

- `GET /api/invitations`; `POST /api/invitations/[id]` with `action` accept/decline.
- `GET /api/organisations/[id]/members` (admins only).
- `GET/POST /api/organisations/[id]/invitations`; POST accepts `email`.
- `POST /api/organisations/[id]/invitations/[invitationId]` with cancel/resend.
- `POST /api/organisations/[id]/members/[userId]` with remove/promote/demote/leave.

PostgreSQL RPCs `invite_member`, `list_invitations`, `respond_invitation`,
`manage_invitation`, `list_members` and `change_member` derive verified identity
and current permissions in storage. All transitions acquire the organisation
row lock before checking current privileges or admin counts. Invitations bind
to account IDs; acceptance consumes the invitation and inserts ordinary membership
atomically. No authenticated direct writes are granted. RLS restricts invitation
reads to recipients/current admins. Expiry uses database time, not the browser.

A private persistent admission window bounds invite/resend attempts to 20/hour
per organisation, including unknown addresses/duplicates. A throttled RPC returns
false so the attempt counter commits; HTTP maps it to a sanitized 429. Other
RPC failures map to 400 (validation), 403 (permission), 409 (transition conflict)
or 503 (service failure), without raw error messages. Admin rosters and invitation
lists are capped at 100; pagination is still a release/scale limitation.
Invitations are in-app; no SMTP or service-role key is needed for them.

For an existing local stack, apply additive migrations without resetting data:
`npx supabase migration up --local --workdir src`. Never use hosted flags for
local testing. `db:start` is for starting the stack; it is not a migration runner
for an already-running database.

## Security and deployment gates

- All mutations require exact configured `APP_ORIGIN`; never infer it from Host
  or forwarded headers. Production fails closed without a valid HTTPS origin;
  local HTTP testing uses `npm run dev`, not the production server.
- Supabase `getUser` verifies protected identity. Server-only sessions use
  HttpOnly, SameSite=Lax cookies and Secure when the configured origin is HTTPS.
  Authenticated JSON is private/no-store. No browser Supabase client is used.
- Public signup uses ordinary Auth signup, not admin preconfirmation. Local Auth
  requires email confirmation. The custom confirmation email displays a code
  rather than placing a credential in an application URL.
- The app adds a coarse process-wide cap of 30 authentication attempts per minute
  (logout excluded). This does not coordinate multiple instances. Supabase Auth
  rate limits are the provider-wide control; hosted limits/abuse settings must
  be verified before release. Every external HTTP request has a 10-second timeout.
- Keep all real keys and sensitive request contents out of logs. No SoC adapter,
  demo provisioning or privileged browser action is implemented yet.
- Hosted verification needs custom SMTP: Supabase's default sender restricts
  recipients. Configure and test delivery and the confirmation template before
  claiming ordinary online signup works.
- The CSP restricts script evaluation to development but still allows inline
  framework scripts/styles. It is not a strict nonce-based injection defence.
  Organisation lists currently return at most the local PostgREST cap (100);
  pagination remains necessary before expanding beyond peer-testing scale.
- Free hosting remains undecided. Verify SoC reachability, request deadlines,
  Node/Next support, SMTP, public organisation-repository deployment and separate
  dev/prod Supabase capacity. Deployments must be team-controlled automation;
  no deployment workflow, live migrations or hosting changes were made here.

## Checks

```sh
npm run verify
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

`verify` runs lint, TypeScript, HTTP tests and a production build. Database tests
are explicitly skipped in the ordinary test command; run `test:integration` for
them. Both integration/browser wrappers obtain only the named local stack's
configuration and reject any API URL except `http://127.0.0.1:55321`. Fixture admin
access is local-only. Browser tests start their own app server on port 3000. If your manual server is
running, use `SPECFORGE_BROWSER_ORIGIN=http://localhost:3001 npm run test:e2e`
for a separate port and `.next-browser` output directory. They use the local inbox and disposable accounts.
Screenshots are ignored under `test-results/`; they are not submission evidence
unless reviewed and summarized. Tests do not call SoCLaaS or hosted Supabase.

One lint dependency override upgrades `minimatch` under TypeScript ESLint to a
patched compatible release. Re-evaluate the override when upstream updates.

## Process and acknowledgements

The main agent implements with the local TDD/codebase-design skills. Security
preflight precedes sensitive work; independent code/architecture and security
reviews follow. See `workflow/README.md`, the approved product specification and
human-verification-pending session summary under `logs/`. Review instructions
are not enforcement; tests and database controls provide the concrete evidence.

Reference research: [Homebrew](https://github.com/CS3227-2610-MP3-Homebrew/CS3227-2610-MP3)
informed the React/Next.js/Supabase and future demo-kit discussion. Its source and
workflow were not copied into this implementation. Supabase's official SSR,
email-code and RLS documentation informed integration. Next.js, React, Supabase,
Zod, Vitest and Playwright are dependencies; consult their package licenses.
