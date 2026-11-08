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

## Ticket delivery interfaces

The approved [ticket delivery spec](../workflow/specs/2026-11-08-ticket-delivery.md)
adds typed metadata outside `{title, description}`: `ticket_number`, `due_date`,
`priority`, `status`, `assignee_ids`, and independent `delivery_revision`.
New publication requires a due date; existing published records are preserved
with null deadlines. Additive migrations assign organisation-scoped numbers in
creation order without changing existing content revisions or timestamps.

- `GET /api/organisations/[org]/requests` now uses `list_ticket_page`: 50 entries,
  `nextOffset`, filters `search/status/priority/assignee/overdue/today/sort` and
  `offset`. Filtering occurs before pagination; `today` is the viewer's ISO
  calendar day for overdue filtering. Offset pages reflect live updates, so a
  refresh is needed if concurrent edits reorder results. Legacy `list_requests`
  remains a capped compatibility RPC; the UI does not use it.
- `POST .../requests/[id]/delivery`: `{revision, changes}`; strict optional change
  keys `due_date/priority/assignee_ids/status`. `update_delivery` locks organisation
  then ticket, checks current identity/membership and author/assignee permissions,
  and conditionally increments delivery revision without changing content revision.
- `GET /api/organisations/[org]/ticket-members?search=&after=`:
  `ticket_members` returns up to 50 current-member IDs/roles and `next_cursor`.
  Search runs before paging. Admin-only membership management/email access is
  unchanged.
- `GET .../requests/[id]/activity?before=`: `read_ticket_activity` uses descending
  bigint IDs serialized as strings, 50 entries and `next_cursor`.
- `POST .../requests/[id]/activity`: `{creationKey, body}`; `comment_ticket` derives
  actor, requires publication/current membership, enforces 4,000 code points and
  20 creations/member/minute/org. Identical idempotency retries do not consume
  quota; changed text with the same key conflicts. Bodies are capped at 32 KiB.

`src/server/delivery.ts` owns delivery HTTP validation/safe errors;
`ticket-schemas.ts` shares request output/filter schemas. Normal operations use
session-bound clients. RPCs and RLS prevent direct unauthorized reads/writes;
activity is append-only and excludes draft/AI events. A membership-delete trigger
removes assignments atomically and increments affected delivery revisions.
Activity actor IDs intentionally survive membership departure. Activity records
metadata deltas, never old requirement text. Historical activity is not invented.

Focused checks: `node src/tooling/test-local.mjs delivery`,
`SPECFORGE_BROWSER_ORIGIN=http://localhost:3001 node src/tooling/test-local.mjs delivery-browser`,
and `node src/tooling/test-local.mjs ticket-migration`. The last creates and drops
one uniquely named throwaway database inside `supabase_db_specforge`, replays all
migrations with minimal Auth compatibility fixtures, and checks legacy data,
reference counters and new-deadline enforcement. Real Auth/RLS is exercised by
ordinary integration tests. It does not reset the app database or contact hosted
services. Run generated-type/build checks sequentially with browser checks.

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
Server-side configuration supports exact model IDs `qwen3.5:9b` and `gemma4:26b`.
`createSocProvider` rejects missing/unsupported IDs before transport; runtime uses
`SOCLAAS_CHAT_MODEL` from the effective server environment. The prompt and caps
are identical for both models; there is no automatic model fallback.
Authenticated discovery reported65,536context tokens. One authorized2048-output-
token check failed or timed out under a45-second deadline; a second600-token check returned valid JSON
with a chat-only reply (49prompt/33completion tokens). These establish limited
compatibility, not production reliability or provider-wide quotas. The official
[SoC API guide](https://soclaas.comp.nus.edu.sg/guides/api.html) confirms the base
URL/chat interface and model discovery; detailed provider limits remain restricted.

The bounded [2026-11-08 writing check](../logs/2026-11-08-soc-writing-stabilization.md)
made nine synthetic live calls plus one sandbox-blocked attempt, with no automatic
retries. Complete draft and clarity proposals were observed, but scope invention,
contradictory unknowns, chat-only clarity, invalid schema/sections and a local timeout
also occurred. Prompt guidance now explicitly forbids added implementation/lifetime
requirements, keeps unknowns consistent, identifies clarity as an edit, and shows
ATX headings/JSON shape. These are guidance changes, not semantic enforcement.
That run did not establish successful live acceptance generation or consistently
useful, scope-preserving drafting. The live checks exercised the provider and section constraint;
authenticated HTTP/persistence/browser evidence is deterministic with a fake provider.
Do not interpret passing local tests as live-provider reliability evidence.

The [tolerant response contract](../workflow/specs/2026-11-08-tolerant-ai-response.md)
normalizes AI output in `validateAiReply`: unknown response/proposal keys are
stripped, and a complete nonblank bounded title/description proposal may omit its
reply (including null/blank string). It receives “Review these suggested ticket
changes.” as neutral review text. Human-only replies still require nonblank text.
Wrong-type known fields, partial/blank/over-limit proposals and empty replies
without a valid proposal fail as invalid_schema; they are not repaired or silently
converted to clarification. Field whitespace is preserved. No prose extraction or
alternate ticket shape is accepted. Internal reply/proposal, client request and
storage contracts stay canonical; acceptance-section merging runs after
normalization. Extra publish/tool/diagnostic-like content keys are discarded,
while actual envelope tool calls remain rejected.

The subsequent [committed live check](../logs/2026-11-08-soc-live-verification.md)
at `2febb62` used ten serial synthetic calls, with unchanged prompts/caps and no
retries. Seven normalized (five proposals/two chat-only replies), two timed out,
and one correctly failed invalid_schema with null title/empty description. One
live clarity proposal had two extra fields stripped, establishing actual tolerant
normalization; missing-reply fallback was not exercised. One live acceptance
result preserved the original title/description through section merging, but
its new criteria invented session/cache behavior and omitted a supplied reset
requirement. Other drafts/clarity edits also invented or omitted requirements.
These observations establish limited compatibility, not reliable writing quality,
authenticated end-to-end success or provider-wide reliability/quotas. No source or
prompt changes were made during that check.

A subsequent [short-prompt experiment](../logs/2026-11-08-soc-prompt-variant.md)
paired the same five synthetic cases with baseline and a fixed shorter,
action-specific system prompt (ten calls total, no retries). Each arm returned
four accepted outputs and one rejected output. Candidate unknowns/clarification
were more focused in those observations, but drafting still invented storage/session
choices, clarity omitted the supplied All-reset behavior, and acceptance lacked
a description. The candidate was not adopted; production prompt remains at
`2febb62`. Exact experiment text/rubric is recorded under `workflow/specs/`.
This fixed-order, single-observation-per-case/arm sample does not establish a
reliability or latency improvement. No application/model/config change followed.

The [Qwen/Gemma comparison](../logs/2026-11-08-soc-model-comparison.md) discovered
`gemma4:26b` with reported 131,072 context tokens and compared it with `qwen3.5:9b`
on five fixed paired synthetic cases using the old prompt. Both had three
normalized outputs and two 60-second local timeouts. Qwen's acceptance reply
refused without a proposal; Gemma generated a section but invented a cache-reset
criterion and omitted All-reset coverage. No overall winner was established;
local `.env` remains Qwen. Gemma is enabled as an exact tested alternative, with
the same limits/strict known-field validation and no fallback. Change only
`SOCLAAS_CHAT_MODEL` to an enabled ID for a deliberate local trial and restart the
dev process; process environment overrides `.env.local`, which overrides `.env`.
Both env files are ignored. No provider/model-specific diagnosis follows from
these small fixed-order observations or from reported context sizes.

A [minimal diagnostic](../logs/2026-11-08-soc-minimal-diagnostic.md) then used one
short three-requirement rewrite per model, with unchanged request settings.
Both returned valid JSON and preserved the title; Qwen omitted the explicit All
control, while Gemma retained all three supplied requirements without added behavior.
One observation/model does not justify a production switch. Application prompt
and default remain unchanged. SoC's public API guide does not specify JSON-mode
or reasoning-effort semantics for these deployments; the detailed DocHub link
could not be fetched. Generic Ollama compatibility documentation cannot verify
SoC's backend/version or whether the effort setting is honored. See the diagnostic
log for source links and the distinction between documented and measured behavior.

The [varied Gemma clarity test](../logs/2026-11-08-gemma-clarity-variety.md) used
five short fictional tickets with the same minimal prompt. Four returned complete
proposals with unchanged titles; one timed out. Published-edit and upload-failure
rewrites met the full preservation rubric, but filter wording dropped the explicit
All label and export wording introduced scope ambiguity. No prompt/model rollout
followed; existing configuration and review/publication controls remain. These
small, empty-history cases do not establish reliability on full tickets or implement
the fictional upload/expiry behavior used as test text.

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
