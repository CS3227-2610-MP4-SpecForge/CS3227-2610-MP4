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

`db:env` updates ignored `.env.local` with local Supabase public values, the
server-only local AI worker key and `APP_ORIGIN`, preserving unrelated settings
and writing atomically with mode0600. It does not change `.env` or copy a hosted project's key.
Next.js gives `.env.local` precedence over `.env`; remove/replace it deliberately
when switching to a hosted development project. Ordinary account/task paths use the public session client. Trusted AI turn
admission/completion alone require server-only `SUPABASE_SECRET_KEY`. `.env.example` documents future server-only SoCLaaS and
privileged-operation slots; routine tests make no live model requests.

## Modules and interfaces

- `src/server/application.ts`: account/organisation HTTP behaviour. Its small
  request/response interface covers validation, authorisation and safe failures.
- `src/server/requests.ts`: strict request lifecycle HTTP actions and safe results.
  `src/server/http.ts` shares bounded JSON and private response handling.
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
the authorised RPCs only; they cannot rewrite roles or memberships directly. Role metadata
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

## Two-field tasks and private AI chat

The approved [two-field AI spec](../workflow/specs/2026-11-07-two-field-ai-workspace.md)
supersedes the earlier six-field lifecycle shape. UI routes remain
`/organisations/[orgId]/requests` and `/[requestId]`. Storage/HTTP `fields` now
contains exactly `{title, description}`; limits are160/24,000 Unicode code points.
The additive migration concatenates all five legacy description sections without
changing IDs, authorship, publication state, revisions or dates. Maximum-length
legacy Unicode content was verified through the actual local migration seam.

Existing create/read/list/save/submit/delete actions and revision conflicts
remain. Request JSON now allows192KiB, enough for valid content plus JSON escaping;
account/membership endpoints retain8KiB. PostgreSQL enforces two-field shape,
limits, nonblank publication and original-author/PM/current-membership access.
The shared editor keeps serialized draft autosave and explicit published saves.
Native editor entry and departure guards protect unsaved work during navigation.

`GET /api/organisations/[org]/requests/[id]/chat` reads the complete private chat.
POST accepts `{key, revision, fields, message, retry}` with a256KiB body cap.
No client history, actor identity, provider URL/model or system prompt is accepted.
Session-bound `read_chat` and RLS enforce verified current PM authorship, including
for submitted tasks. Authenticated clients cannot mutate chat storage or call
worker admission/completion. Normal request reads/writes remain session-bound.

After verified `getUser` and session chat authorization, the isolated server
worker calls service-role-only `begin_chat_turn` and `finish_chat_turn`. Both
independently recheck verified identity/current membership/authorship and use
organisation-first locks. The privileged key never reaches browser code. Each
idempotent key binds an immutable editor snapshot/message. Persistent admission
allows one running turn/request and/account,20admitted attempts/account/hour.
120-second leases and generation checks reject late workers; expired turns are
retried only on explicit action, never automatically. Completion rechecks access,
so output after removal is neither stored nor returned. Conversation rows cap
at1MiB with completion capacity reserved at admission and a final exact check.

`src/server/soc.ts` is the bounded SoC adapter; `chat.ts` owns HTTP orchestration.
Requests explicitly set `response_format: {type: "json_object"}` as well as the
JSON prompt; prompt-only formatting was observed returning HTTP200/stop with
non-JSON content in a synthetic first-draft reproduction. The paired JSON-mode
check returned a valid chat-only reply. These are compatibility observations,
not a reliability/latency benchmark or diagnosis of historical discarded output.
Only the verified configured `qwen3.5:9b` runtime model is currently enabled.
Authenticated discovery reported65,536context tokens. One authorized2048-output-
token check failed or timed out under a45-second deadline; a second600-token check returned valid JSON
with a chat-only reply (49prompt/33completion tokens). These establish limited
compatibility, not production reliability or provider-wide quotas. The official
[SoC API guide](https://soclaas.comp.nus.edu.sg/guides/api.html) confirms the base
URL/chat interface and model discovery; detailed provider limits remain restricted.

Application policy: full serialized messages (system, complete private history,
current editor and message) <=48,000UTF-8bytes;2,000output tokens;60-second deadline;
64KiB response bytes;4,000-character user messages and no separate AI reply
character ceiling. No context trimming, tools,
automatic retry or fallback. Invalid/truncated/provider responses become durable
failed turns without raw provider diagnostics. Context-full failures preserve history
and allow manual editing. These are app caps, not claims about SoC quotas.

Failure diagnostics use `local_timeout`, `upstream_http` and `network_error`.
`invalid_output` now has a fixed source/reason pair: truncated, invalid_json,
invalid_schema, invalid_envelope, missing_content, tool_calls, unexpected_finish,
body_limit or unsafe_section. TypeScript and storage reject unknown reasons and
extra keys. Parse exceptions, schema paths, raw provider content and hidden
reasoning are never persisted. Historical invalid-output rows retain null metadata
and remain readable. Empty tool-call lists are harmless; actual tool calls fail.
Only the adapter's own aborted60-second signal establishes local_timeout, during
fetch or body read. Upstream errors retain numericHTTPstatus and monotonic
app-observed elapsed milliseconds; transport errors carry no raw exception.
Strict allowlisted metadata is persisted on author-private chat turns, validated
in HTTP and the worker-only completion RPC; retries clear it. Historical
unavailable rows retain null diagnostics. Browser waiting timeouts use a separate
client error and are not provider diagnostics. No additional content logging or
live provider calls are needed to distinguish these states.

The [ticket-first AI spec](../workflow/specs/2026-11-08-ticket-first-ai.md)
supersedes the fixed two-column proposal-in-chat interaction. `ChatPanel` owns
private turn sending/recovery, the rough-idea starter, writing actions and a
collapsible discussion, composing the editor as its child. `RequestEditor` owns
all task replacement, exact local/revision freshness and authorized remote
rechecks, plus inline review and conditional first-draft Undo. Draft autosave and
explicit published saves are unchanged. Only a direct, newly requested first-draft
completion may fill the private editor automatically. Reconciled/polled/history
results require review. `SuggestionReview` renders a literal text diff, never HTML.

`src/assistance.ts` shares the user-visible action messages; these are persisted
as ordinary immutable turn messages, so retries retain their action. No new
client actor/history fields or worker privileges are introduced.
`src/server/task-suggestions.ts` suppresses proposals for the exact missing-details
action and merges only the Acceptance criteria section for that action. Supported
ATX/colon headings are parsed outside backtick/tilde fences. Ambiguous sections,
unsupported bold/setext section styles, missing generated criteria, unclosed
fences and over-limit merges fail safely;
all original title/outside-section bytes remain intact. Other AI edits retain
whole-ticket review. Prompt guidance improves writing behaviour but authorization
and edit scoping are runtime controls. No live-provider reliability claim follows
from deterministic fake-model journeys.
Markdown uses a small React text-only renderer for headings/lists/paragraphs/code;
HTML, URLs and images are never executed or fetched.

Browser tests inject a local fake only with an explicit test flag, development
mode, allowlisted localhost origin and disposable Supabase URL. Any invalid fake
configuration fails closed instead of falling through to SoC. Production cannot
select it. Tests pass the local worker key only to the server subprocess.

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
  be verified before release. Supabase HTTP requests have a10-second timeout; the separate SoC adapter has
  a60-second deadline and browser chat waits75seconds.
- Keep all real keys and sensitive request contents out of logs. The SoC adapter is server-only; demo provisioning and privileged browser actions
  remain unimplemented.
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
Run type generation/build checks sequentially with browser tests: Next.js rewrites
shared generated type references even with a separate output directory. For
focused request checks, use `node src/tooling/test-local.mjs requests` or
`SPECFORGE_BROWSER_ORIGIN=http://localhost:3001 node src/tooling/test-local.mjs requests-browser`.
Screenshots are ignored under `test-results/`; they are not submission evidence
unless reviewed and summarized. The one-off legacy migration check is
`node src/tooling/test-local.mjs migration` and runs only before the two-field
migration is applied; ordinary tests explicitly skip it. Tests do not call SoCLaaS or hosted Supabase.

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
