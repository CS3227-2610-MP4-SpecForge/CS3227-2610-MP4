# SpecForge Developer Guide

## Local setup

Requirements: Node.js 22, npm, Docker Desktop running. Node 22 is the version
the deployment target supports, so local, CI and both environments run the same
major; Vercel rejects a project whose `engines` ask for Node 24. Dependencies are locked
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
suppress CLI output that can contain generated local credentials. When a
command fails, the tail of that output is relayed with credential-shaped values
redacted, because a failure with no reason at all cannot be diagnosed in CI.

`db:env` updates ignored `.env.local` with local Supabase public values, the
server-only local AI worker key and `APP_ORIGIN`, preserving unrelated settings
and writing atomically with mode0600. It does not change `.env` or copy a hosted project's key.
Next.js gives `.env.local` precedence over `.env`; remove/replace it deliberately
when switching to a hosted development project. Ordinary account/task paths use the public session client. Trusted AI turn
admission/completion alone require server-only `SUPABASE_SECRET_KEY`. `.env.example` documents the server-only SoCLaaS settings both AI features use;
routine tests make no live model requests.

## Modules and interfaces

- `src/server/application.ts`: `createApplication`, the single `/api` entry
  point. It runs the origin check, the public health check, auth admission and
  the identity check in that order, then dispatches to route tables. Its small
  request/response interface covers validation, authorisation and safe failures.
- `src/server/routes.ts`: the route table type `{ method, pattern, handler }` and
  `matchRoute`. The first matching entry wins, so each table's order is part of
  its behaviour.
- `src/server/auth.ts` (sign-up, sign-in, verification, resend, sign-out and auth
  admission), `src/server/organisations.ts` (organisations, membership and
  invitations) and `src/server/account.ts` (profile and username) hold the routes.
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
Signup requires `username` for both roles. The app passes the lowercase value
through Supabase Auth signup metadata. The existing account-creation trigger
validates it and writes `profiles.username` in the signup transaction. PostgreSQL
`NOT NULL` and `UNIQUE` constraints enforce the requirement across all profiles.
The additive migration assigns reserved `legacy_` usernames to existing profiles.
Sign-in and verification use email. `GET /api/account` returns verified account
identity, role and username from the protected profile.

The app gives the same signup response for accepted requests and ambiguous
Auth provisioning failures, with guidance to try a different username if no
code arrives. The raw Supabase Auth signup endpoint may return different statuses
for a username collision and an existing email because repeat signups can skip
the profile trigger. This difference remains visible to callers of that endpoint.

`GET/POST /api/organisations` list/create; `GET /api/organisations/[id]`
selects a member-visible organisation. The membership slice adds the routes below.

## Shared action notifications

RootLayout mounts the client NotificationProvider from `src/components/notifications.tsx`.
Call `useNotifications().notify(message, danger?)` for transient action feedback.
`useNotificationState` adapts string state that must still gate recovery controls;
expiry removes the global banner only, not the local recovery state. Do not use
this adapter for text input or ongoing field validation. NotificationBanner owns
presentation; the provider owns event identity, replacement and three-second timer
cleanup. Error events use red alert styling and informational events use polite
status styling. Repeated identical events restart the timer without overlap.

The shared `Modal` (used by organisation management and AI change review) registers its native top-layer element explicitly so notifications
from anywhere remain visible above the modal. Host changes preserve the deadline.
Keep persistent save/conflict state, field guidance and saved AI history contextual.
Browser coverage checks last-admin error expiry, signup verification navigation,
invitation repeat timing, and developer test-plan content/retry preservation.

## Session expiry

`api` in `src/components/http.ts` is the one place that recognises an ended
session: a 401 from any call outside `/api/auth/` (sign-in answers rejected
credentials with 401). `onSessionChange(listener)` reports `false` on such a 401
and `true` once a non-auth call or sign-in succeeds again. RootLayout mounts
`SessionBanner` from `src/components/session.tsx` once below the header; it shows
the persistent alert with a plain **Sign in again** link (a document navigation, so
editor departure guards apply) and never redirects. On the public pages (`/`,
`/sign-in`, `/sign-up`, `/verify-email`) the account menu's check is expected to
fail, so a 401 there hides the banner instead, including one carried over by the
workspace or profile client redirect. Components do not special-case 401 except to stop
retrying: the editor turns it into a retryable problem that halts autosave, and
the workspace and profile pages keep their redirect. A 403 remains an in-place
"no permission" outcome.

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
row lock before checking current privileges or admin counts. Invitations persist against canonical email addresses, including unregistered ones.
Only the current verified Auth email owner can read pending recipient invitations
or accept/decline; acceptance binds the account ID and inserts ordinary membership
atomically. Email-based RLS is limited to pending rows so a reused address cannot
read another account's accepted history. No authenticated direct writes are granted.
Admins read their own organisation's outgoing rows, including declined entries.
Expiry uses database time, not the browser.

A private persistent admission window bounds invite/resend attempts to 20/hour
per organisation, including unknown addresses/duplicates. Invite/manage RPCs return structured status outcomes (`created`, `pending`,
`member`, `limited`, `resent`, `cancelled`) so expected validation preserves quota
increments. HTTP maps `limited` to 429 and `member` to 409. Creation/duplicate
responses return truthful messages at 202; withdrawal returns its message at 200. Other
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
Due dates are optional for drafts and published records; supplied dates remain
validated. The additive optional-date migration removes both the first-publication
trigger and the published-date-clearing restriction. Additive migrations assign organisation-scoped numbers in
creation order without changing existing content revisions or timestamps.

- `GET /api/organisations/[org]/requests` now uses `list_ticket_page`: 50 entries,
  `nextOffset`, filters `search/status/priority/assignee/overdue/today/sort` and
  `offset`. Filtering occurs before pagination; `today` is the viewer's ISO
  calendar day for overdue filtering. Sort accepts `updated`, `due`, or `status`.
  Migration `20261110000000_ticket_status_sort.sql` groups statuses before
  pagination and places Done last. Apply it before deploying the updated UI.
  Offset pages reflect live updates, so a
  refresh is needed if concurrent edits reorder results. Legacy `list_requests`
  remains a capped compatibility RPC; the UI does not use it.
- `POST .../requests/[id]/delivery`: `{revision, changes}`; strict optional change
  keys `due_date/priority/assignee_ids/status`. `update_delivery` locks organisation
  then ticket, checks current identity/membership and author/assignee permissions,
  and conditionally increments delivery revision without changing content revision.
- `GET /api/organisations/[org]/ticket-members?search=&after=&selected=`:
  `ticket_members` returns up to 50 current-member IDs/emails/roles/usernames,
  `next_cursor`, and up to five independently resolved `selected_members`.
  Email search runs before paging. All organisation members can use this lookup;
  membership management remains admin-only.
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
Ticket reads supply `author_username` and ordered `assignee_usernames` on visible
records. Activity reads supply `actor_username` and resolve before/after assignment
labels from the referenced IDs, including departed members. Deleted accounts
display as **Former account**. Assignment, access and activity storage keep UUIDs.

Focused checks: `node src/tooling/test-local.mjs delivery`,
`SPECFORGE_BROWSER_ORIGIN=http://localhost:3001 node src/tooling/test-local.mjs delivery-browser`,
and `node src/tooling/test-local.mjs ticket-migration`. The last creates and drops
one uniquely named throwaway database inside `supabase_db_specforge`, replays all
migrations with minimal Auth compatibility fixtures, and checks legacy data,
reference counters and optional publication dates. Real Auth/RLS is exercised by
ordinary integration tests. It does not reset the app database or contact hosted
services. Run generated-type/build checks sequentially with browser checks.

## Ticket layout and AI sidebar

The approved [layout spec](../workflow/specs/2026-11-08-ticket-layout.md) removes
visible ticket references and the duplicated author-page title heading. Internal
numbers, routes and compatible search/storage interfaces remain unchanged.
`TicketDeliveryFields` renders compact fields below Title; `CopyTicketLink` lives in
the compact navigation row. Storage keeps separate delivery/content revision
checks; the author UI coordinates one whole-ticket save. `TicketDeliveryFields` is controlled by
the author editor; `TicketDelivery` handles assigned-reader status edits. The
Title and due-date inputs associate with the ticket form by native `form`
attributes. Title/description required validation runs on Publish; due date is
optional. Incomplete draft
autosaves bypass form validation. Whitespace/limit failures show on-demand
validation. Idle Publish is clickable; busy or conflicted actions remain blocked.

`ChatPanel` owns a two-column layout: main ticket content plus a collapsible,
initially open AI sidebar. `useAssistant` (in `use-assistant.ts`) owns the
conversation state, sending, recovery, polling and usage; the editor creates it
so **Draft with AI** (in the Description header) and the sidebar share one request
guard. On an empty ticket the sidebar composer sends a `draft` request carrying the
PM's text.
Header and footer slots let the editor supply its own controls (Undo AI draft
sits in the pinned footer). The transcript, change cards, composer and usage bar
render inside the sidebar; the review modal is rendered by the editor.
The main editor is always available on empty drafts, and a first draft fills the
editor only while its exact snapshot is still current.
Collapsing uses `hidden`, preserving the mounted conversation and instruction.
The layout move preserves provider behaviour and permissions. The whole-ticket
save contract extension is described below.

Focused browser check:
`SPECFORGE_BROWSER_ORIGIN=http://localhost:3001 node src/tooling/test-local.mjs layout-browser`.
Browser modes also accept an optional test-name regex as a final argument, e.g.
`node src/tooling/test-local.mjs requests-browser "a lost first-draft response"`.
The layout check covers field/tool placement, hidden references, collapse persistence, sidebar
review, new-draft manual writing and the Developer layout. Existing browser
freshness, retry and in-flight-edit regressions remain in the full suite.

## Ticket visibility banner and icons

The approved [visibility spec](../workflow/specs/2026-11-08-ticket-visibility-banner.md)
adds `TicketVisibility` directly along the top inside edge of the left ticket
card, above Title. Navigation remains above the card, with a shared Lucide
ArrowLeft on Back to requests. Responsive card padding keeps the banner flush
without clipping the ticket editor. `RequestScreen`
loads the organisation name from the existing authorized organisation GET; no
banner is rendered until ticket, account and organisation have loaded. Reader
and author views share the same banner; author visibility follows saved state,
including recovery after an ambiguous Publish. Local published edits do not
change the banner. The old publication badge is removed. The static About this
ticket section shows metadata at the bottom of the ticket card, beneath author
actions or the reader refresh action and before team discussion. The author
save status sits below the metadata. Draft content saves record
`last_autosaved_at`, which survives delivery-only updates and is cleared on
publication. Older drafts with no recorded autosave time and published tickets
show Last saved using `updated_at`.

Draft delivery status is a disabled To do select, distinct from visibility.
Status permissions after publication remain unchanged. `lucide-react` is pinned
to 1.70.0 (ISC), with named static Lock/Eye imports, decorative aria-hidden SVGs
and shared `.ui-icon` size/stroke tokens. Use the same library/style for future
icons; no runtime CDN/network fetching. Purple banner styles reuse theme tokens
and wrap long organisation names. Layout browser tests cover delayed/lost
publication, author/member parity, mobile wrapping, failed name loading and safe
text rendering. No database or permission changes.

## Whole-ticket Publish and Update

The approved [whole-ticket spec](../workflow/specs/2026-11-08-ticket-autosave.md)
supersedes separate delivery saves. Author drafts autosave all editable fields;
Publish and Update save the whole ticket. Published metadata remains local until
Update. Publish/Update are direct explicit actions without an acknowledgement
checkbox. They send the legacy `acknowledged: true` compatibility field; server
validation, permissions and atomic persistence are unchanged.

Content mutation HTTP actions accept optional `delivery: {revision, changes}`.
When supplied, `save_ticket` locks the authored request, checks both revisions,
then composes existing `update_delivery` and `save_draft`/`publish_request` in one
transaction. Validation or conflicts roll back all writes and activity. Empty
changes still check delivery revision. Legacy calls remain compatible; assigned
readers retain the status-only delivery endpoint with an Update button.

The author editor owns delivery state and navigation protection alongside text.
Its lost-response check compares content, publication state, delivery values and
both expected revisions before reporting success. Recovery controls appear only
after failures. Apply `20261108015000_whole_ticket_saves.sql` using the local
additive migration command before testing. Hosted environments receive it from
the deployment workflow.

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
POST accepts `{key, revision, fields, intent, message?, answers?, retry}` with a
256KiB body cap. `intent` is `draft`, `gaps` or `edit`; draft, gap-check and
apply-answers turns use fixed server messages from `src/assistance.ts`.
No client history, actor identity, provider URL/model or system prompt is accepted.
Session-bound `read_chat` and RLS enforce verified current PM authorship, including
for submitted tasks. Authenticated clients cannot mutate chat storage or call
worker admission/completion. Normal request reads/writes remain session-bound.

After verified `getUser` and session chat authorization, the isolated server
worker calls service-role-only `begin_chat_turn` and `finish_chat_turn`. Both
independently recheck verified identity/current membership/authorship and use
organisation-first locks. The privileged key never reaches browser code. Each
idempotent key binds an immutable editor snapshot, message, intent and answers.
Persistent admission allows one running turn/request and/account, 20 charged
requests and 40 admitted attempts per account per hour. Every failed turn is
refunded once, only within the window that charged it; attempts are never
refunded, so the attempt cap bounds SoC spend. An identical completed request
on the current ticket returns the saved turn with no call or charge.
`read_ai_usage()` returns the signed-in account's `{remaining, limit, resets_at}`;
GET and POST chat responses include it, and 429 responses name the limit.
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

Application policy ([PM assistant redesign](../workflow/specs/2026-11-10-pm-ai-assistant-redesign.md)):
each request sends a shared rule block plus that intent's rules, then one JSON
payload `{ticket, instruction, recent, answers?}`. `recent` holds at most the three
latest completed turns as `{message, reply}` with replies cut to 1,000 characters;
proposals and older turns are never sent. Output budgets are 2,000 tokens for
`draft`, 600 for `gaps` and 1,200 for `edit`. Edits return exact-text
`{field, find, replace}` changes (at most 10). `applyEdits` applies them only when
each `find` matches exactly once (literal, overlapping matches count), then stores
the full resulting fields as the proposal for the usual review. Draft descriptions
and edit replacements are cleaned first: `unescapeLineBreaks` turns literal `\n`
outside code fences into line breaks, and `stripRepeatedTitle` drops a copy of the
title at the top of a drafted description. Serialized
messages stay <=48,000 UTF-8 bytes, with a 90-second deadline, 64KiB response
bytes and 4,000-character instructions. No tools, automatic retry or fallback.
These are app caps, not claims about SoC quotas.

Failure diagnostics use `local_timeout`, `upstream_http` and `network_error`.
`invalid_output` now has a fixed source/reason pair: truncated, invalid_json,
invalid_schema, invalid_envelope, missing_content, tool_calls, unexpected_finish,
body_limit, unsafe_section or unmatched_edit. TypeScript and storage reject unknown reasons and
extra keys. Parse exceptions, schema paths, raw provider content and hidden
reasoning are never persisted. Historical invalid-output rows retain null metadata
and remain readable. Empty tool-call lists are harmless; actual tool calls fail.
Only the adapter's own 90-second abort signal establishes local_timeout during
fetch or body read. Upstream errors retain numericHTTPstatus and monotonic
app-observed elapsed milliseconds; transport errors carry no raw exception.
Strict allowlisted metadata is persisted on author-private chat turns, validated
in HTTP and the worker-only completion RPC; retries clear it. Historical
unavailable rows retain null diagnostics. Browser waiting timeouts use a separate
client error and are not provider diagnostics. No additional content logging or
live provider calls are needed to distinguish these states.

The [ticket-first AI spec](../workflow/specs/2026-11-08-ticket-first-ai.md)
supersedes the fixed two-column proposal-in-chat interaction; the 2026-11-10
redesign replaces its rough-idea starter and Leave undecided action. The
[AI chat review spec](../workflow/specs/2026-11-11-ai-chat-review-modal.md)
replaces the latest-result box and whole-suggestion review. `ChatPanel` renders
one transcript (each reply with its change card, gaps checklist or plain failure
with Details), the usage bar, one composer and **Check for gaps**, composing the
editor as its child. Only the newest unanswered gaps checklist is interactive.
`src/ticket-changes.ts` splits a turn's `input_fields` → `proposal` into
changes in the browser (a line diff, each change located by its lines plus the
unchanged line on each side) and derives open/applied/outdated status from the
current ticket; nothing per change is stored. `ChangeReview` (in a shared
`Modal`) applies or undoes one change as an ordinary editor edit and renders text
as React children or the safe `Markdown` renderer, never HTML. Rejections live in
`RequestEditor` state for the page session. Only a direct, newly requested
first-draft completion may fill the private editor automatically, with the
existing freshness recheck and Undo AI draft.

`src/assistance.ts` defines the intents and the fixed draft, gap-check and
apply-answers messages. Gap questions are stored on `gaps` turns; answers are
stored on the `edit` turn that applies them, and **Leave undecided** / **Your own
answer** are added by the client. Questions and options render as plain text.
After an ambiguous send, `useAssistant` reads the saved conversation and checks
the original turn key. It offers explicit resend only when that key is absent.
Reads and sends share an operation guard, and reopening the panel can recover a
failed read. Recovered proposals use the explicit review flow.
Markdown uses a small React text-only renderer for headings/lists/paragraphs/code;
HTML, URLs and images are never executed or fetched.

Browser tests inject a local fake only with an explicit test flag, development
mode, allowlisted localhost origin and disposable Supabase URL. Any invalid fake
configuration fails closed instead of falling through to SoC. Production cannot
select it. Tests pass the local worker key only to the server subprocess.

## Developer test plans

The Developer role's AI feature generates test cases for a published ticket. It
reuses the PM chat's safety structure rather than inventing a second one.

**Shared transport.** `requestSocJson` in `src/server/soc.ts` owns the whole
bounded SoC request: configuration allowlist, 48,000-byte context bound, one
90-second deadline with no transport retry, the 64 KiB response cap and every
envelope check. A feature supplies only its instructions, its completion budget
and its validator. `createSocProvider` (PM chat, 2,000 tokens) and
`createTestPlanProvider` (test plans, 3,000 tokens) are both thin callers, so
failure mapping and diagnostics cannot drift between the two features.

**Plan shape.** `src/test-plans.ts` holds the caps and labels once for client,
server and instructions: at most 12 cases; a case has a title (160), a kind of
`happy`, `edge` or `failure`, optional preconditions (500), 1 to 10 steps (300
each) and an expected result (500). `private.valid_test_plan` in the migration is
the storage-side authority and must agree with those numbers.

**Tables.** `public.test_plan_turns` mirrors `chat_turns`: idempotent
`(request_id, turn_key)`, one running turn per developer, 120-second leases with
generation fencing, allowlisted `error_code` and a `diagnostic` validated by the
existing `private.valid_ai_diagnostic`. `public.ticket_test_plans` holds one
saved plan per ticket with its own `revision` and the `ticket_revision` it was
generated against.

**Authorization.** `private.is_ticket_developer` requires organisation
membership, `app_role = 'Developer'` and a published ticket. Turn rows are
selectable only by their own developer; a saved plan is selectable by any member,
so a PM sees the shared plan but never another account's generations.
`begin_test_plan_turn` and `finish_test_plan_turn` are granted to `service_role`
only; `save_test_plan` runs under the developer's own session because saving is
their decision. `handleTestPlans` authorizes through the user's session with
`read_test_plan` before it constructs worker access or contacts SoC.

**Untrusted output.** Ticket content and the focus note travel as a separate JSON
payload, never interpolated into the instruction text, and the instructions state
they are reference material. Provider extras are stripped before storage, and an
absent optional is dropped rather than stored as an empty key, because the
storage check counts keys. The panel renders every generated field as plain text,
never as Markdown or HTML, so a case cannot inject formatting or links into a
ticket view.

**Staleness.** `save_test_plan` compares the submitted ticket revision with the
locked row and refuses a mismatch, and compares the expected plan revision with
the stored one so two developers saving at once cannot silently clobber.

### Observed provider behaviour

Measured on 2026-11-10 against `https://soclaas-api.comp.nus.edu.sg/v1`, so
treat the figures as one sample, not a service level:

- `GET /models` listed 20 models. `qwen3.5:9b` and `gemma4:26b` are both
  listed, but a chat completion on `gemma4:26b` returned HTTP 503 with
  `no healthy provider backends` in about 30ms. A model appearing in `/models`
  therefore does not mean it will serve a request, and the configured
  `SOCLAAS_CHAT_MODEL` is `qwen3.5:9b`.
- A successful call took 6.6s to 9.1s for a chat turn or a 12-case plan budget.
  One attempt returned HTTP 502 after 60.1s, which looks like a gateway
  deadline shorter than our own 90s `aiResponseTimeoutMs`. Both were mapped to
  `upstream_http` with the status and elapsed time in the diagnostic, and
  neither was retried automatically, which is the intended behaviour: a retry
  here would spend a second admission against the hourly cap on a backend that
  is already failing.
- A 12-case plan request cost 472 prompt tokens and 490 completion tokens, so
  the 3,000-token completion budget is not the binding constraint.
- The model regularly writes one case that overruns a stored limit, usually the
  expected result. Validation discards that case and keeps the rest; see the
  plan shape above.

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
- The app adds a coarse cap of 30 authentication attempts (sign-up, sign-in,
  verify and resend; logout excluded) per clock minute, shared by all callers.
  `createAuthAdmission` keeps the count in memory, so the cap applies separately
  on each server instance. On Vercel the effective limit grows with the number of
  running instances, and an instance's count resets when it restarts. Supabase
  Auth's own rate limits are the real control; check the hosted values before
  release (see [First-time setup](#first-time-setup) step 7).
- Supabase HTTP requests have a 10-second timeout; the separate SoC adapter has
  a 90-second deadline and browser chat waits up to 110 seconds.
- Keep all real keys and sensitive request contents out of logs. The SoC adapter is server-only; demo provisioning and privileged browser actions
  remain unimplemented.
- Server failure logging: every unexpected failure that becomes a 503 (the
  `createApplication` catch-all and RPC, schema or configuration failures in the
  handlers, plus the invalid-`APP_ORIGIN` 503 in `runtime.ts`) and every AI provider failure inside a chat or test plan turn writes
  one JSON line through `console.error` via `logFailure`/`serviceUnavailable` in
  `src/server/http.ts`. Vercel collects these as function logs. A line holds only
  `event: "server_failure"`, the method (`OTHER` if unusual), the route pattern
  (static route words kept, every other segment `:id`, unknown prefixes
  `/:unknown`, no query), our response `status`, the error class name, a
  validated `code` (SQLSTATE, PostgREST, Auth or `AiFailure` code), an Auth
  `upstreamStatus` and, for AI, the strict allowlisted diagnostic. Messages,
  bodies, headers, cookies, emails, IDs and AI text are excluded by construction.
  Expected 4xx outcomes log nothing. Lines are not rate-limited, so an upstream
  outage produces one line per failed request.
- Hosted verification needs custom SMTP: Supabase's default sender restricts
  recipients. Configure and test delivery and the confirmation template before
  claiming ordinary online signup works.
- The CSP restricts script evaluation to development but still allows inline
  framework scripts/styles. It is not a strict nonce-based injection defence.
  Organisation lists currently return at most the local PostgREST cap (100);
  pagination remains necessary before expanding beyond peer-testing scale.
- Deployment is team-controlled automation under `.github/workflows/`; see
  [Deployment and environments](#deployment-and-environments). Both environments
  have been deployed, with migrations applied by the workflow. Hosted use beyond
  the sign-up page has not been verified: SoC reachability from the host, hosted
  request deadlines and custom SMTP still need checking against the real
  environments before claiming online signup and AI features work.

## Deployment and environments

### Shape

| | Development | Production |
| --- | --- | --- |
| Branch | `dev` | `main` |
| Workflow | `deploy-development.yml` | `deploy-production.yml` |
| GitHub Environment | `development` | `production` |
| URL | <https://specforge-dev.vercel.app> | <https://specforge-prod.vercel.app> |
| Vercel target | production target of that project | production target |
| Supabase project | development project | production project |

Both callers delegate to the reusable `deploy.yml`, so the steps and their order
exist once: apply migrations, pull that scope's configuration, build, deploy,
record the URL, then check the release (below). The production caller first
runs the whole of `ci.yml` on the merge commit, so production is never reached
without a passing suite. Merging into `main` is the human decision. The
`production` environment does not yet have a required reviewer; adding one
(first-time setup step 4) would make deployment a second, separate approval.

Vercel's own Git integration is deliberately not connected. The repository owns
the trigger and the gates, and the Vercel CLI is invoked as a step, which keeps
the automation team-managed as the course requires.

Migrations run before the deployment, so the schema cannot trail the code that
expects it. A failed `supabase db push` stops the run before anything is
deployed. CLI output is suppressed because it can carry credentials; only the
outcome is reported.

### Release check

`GET /api/health` is public, needs no session and is never cached. It answers
`{ status, revision, database, ai }`:

- `revision` is the commit SHA built into the app, or `unknown` for a local
  build. The deploy moves `.git` aside, so the Build step passes `github.sha`
  as `SPECFORGE_REVISION`, and `next.config.ts` fixes it into the build.
- `database` is `ok` when the anon-callable `public.health_check()` answers
  `true` within 3 seconds using the publishable key. The function reads no
  table. Otherwise it is `unavailable` and the response is 503.
- `ai` is `configured` when the SoC URL, key and an enabled model are set, or
  `missing`. It never calls the model.

The response contains only these fixed words and the SHA: no key, URL, model ID
or error text. The last step of `deploy.yml`, **Check the release**, runs
`src/tooling/check-health.mjs` against the environment's `site-url` (set by each
caller). It polls for up to 3 minutes and passes only when the public URL
reports this run's commit with `database: ok` and `ai: configured`. This also
catches an older deployment that is still answering. To check a site by hand:

```sh
node src/tooling/check-health.mjs https://specforge-dev.vercel.app <commit-sha>
```

### Configuration boundary

GitHub holds only what the pipeline itself needs, per environment, as
GitHub Environment secrets rather than repository-wide secrets:

`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.

Application runtime configuration — `APP_ORIGIN`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SOCLAAS_BASE_URL`,
`SOCLAAS_API_KEY`, `SOCLAAS_CHAT_MODEL` — is set in each Vercel project's
Production scope, pointing each environment at its own Supabase project.
`APP_ORIGIN` must be the exact HTTPS origin of that environment: the server fails
closed on a missing or non-HTTPS origin in production rather than inferring one
from request headers.

### First-time setup

1. Create the `dev` branch from `main` and protect both: pull requests into
   `dev`, no direct pushes to `main`.
2. Create two Supabase projects, development and production, and keep their
   service keys out of the repository and out of local `.env`.

   Set each project's **Site URL** (Authentication, URL Configuration) to that
   environment's deployed origin. A hosted project defaults to
   `http://localhost:3000`, and the application does not pass an explicit
   `emailRedirectTo`, so the default is what verification emails link to: a
   deployed sign-up otherwise sends the user to their own machine. Note that
   `src/supabase/config.toml` is the local stack's configuration and correctly
   says `localhost`; `supabase db push` never touches hosted auth settings, but
   `supabase config push` would overwrite them, so do not run it against a
   deployed project.
3. Create two empty Vercel projects, `specforge-dev` and `specforge`, without
   connecting a Git repository: Vercel's own Git deployments would take the
   automation out of the team's hands and race with `deploy.yml`. Set the
   runtime variables above in each project's Production scope.

   `vercel.json` at the repository root declares `framework: nextjs`. An empty
   Vercel project defaults to no framework and then looks for a static `public`
   directory, so the build fails after Next.js has already built successfully.
   Declaring it in the repository keeps the setting in version control rather
   than in a dashboard checkbox.

   Each environment deploys to its own project's production target rather than
   to a preview. A Vercel preview URL is unique per deployment, while
   `APP_ORIGIN` has to be one fixed origin, so a preview target would give the
   development app an origin that changes on every push. `VERCEL_PROJECT_ID` is
   an environment secret, so the two environments name different projects.
4. Create the `development` and `production` GitHub Environments, add the six
   secrets to each, and add a required reviewer to `production`.
5. In repository settings, set Pages to build from GitHub Actions.
6. Push to `dev` and confirm the development deployment, then open a pull request
   to `main`.
7. Configure custom SMTP on both Supabase projects and test the confirmation
   email before telling peer testers that signup works. Supabase's default sender
   restricts recipients. Also check each project's Auth rate limits
   (Authentication, Rate Limits): they are the real limit on sign-up, sign-in,
   verification and email sending, because the app's own cap is per instance.

### Product website

`website/` holds the Jekyll source for the GitHub Pages product website.
`pages.yml` copies `docs/*.md` into that source at build time and adds the front
matter Jekyll needs, so the guides stay single-source in `docs/` and the
published site cannot drift from them. The copies are ignored by Git.

### Continuous integration

`ci.yml` runs on every pull request, on pushes to `dev` and `main`, and as the
production gate. The `verify` job runs lint, TypeScript, unit and HTTP tests and
a production build; the `integration` job starts a disposable local Supabase
stack and runs the database and browser suites. No CI job reaches a hosted
Supabase project or the SoC LLM, so continuous integration consumes no provider
quota and no real key.

### Workflow folder

Process material lives under `workflow/`:

- `README.md`: the active development workflow — the everyday loop, coordination
  and resource limits, and the installed skills.
- `specs/`: one approved specification per feature, plus the historical workflow
  design decisions. Approval of a spec is what starts implementation.
- `plans/`: implementation plans, written only for changes complex enough to need
  one.
- `agents/`: the two reviewer role briefs, `code-reviewer.md` and
  `security-reviewer.md`, loaded when those agents are dispatched.
- `architecture.md`, `ui.md`: short shared engineering policies on module
  boundaries and on UI/theme reuse.
- `templates/session-summary.md`: the template each session log follows.
- `THIRD_PARTY.md`, `MATT-POCOCK-LICENSE`: provenance and licensing for reused
  workflow material and local adaptations.

Claude Code configuration in `.claude/` makes independent review enforceable:

- `agents/code-reviewer.md` registers the read-only `code-reviewer` subagent,
  which follows `workflow/agents/code-reviewer.md` and ends with a
  `Verdict: approved` or `Verdict: needs-fixes` line.
- `settings.json` runs `hooks/review-gate.mjs`. It records a hash of the
  uncommitted `src/` diff each time `code-reviewer` finishes. It denies
  `git commit` until that exact diff is approved. When a turn ends with unreviewed
  `src/` changes, it asks once for a review (pauses for user input are allowed).
  Once a session log under `logs/` has also changed, it insists. State is kept in
  ignored `local/review/state.json`. Set `SPECFORGE_REVIEW_GATE=off` to disable it
  for a human-driven session. Other agent clients do not run these hooks.

Project-local agent skills are versioned in `.agents/skills/` so that cloning the
repository reproduces them, and `AGENTS.md` at the root is the entry point agents
read first. Sanitised session summaries are in `logs/`.

For unfinished work, the workflow also defines a concise handoff in ignored
`local/notes/active/<task>.md`: agreed scope, current state, relevant files,
decisions, evidence and a concrete next action. Agents check a matching note
against the current checkout when resuming. These notes are local to a checkout;
share the specific note explicitly for a handoff to another machine. Update them
in place and remove them when complete, preserving lasting decisions in the
existing spec or guide and outcomes in the normal session summary.

## Checks

```sh
npx playwright install chromium
npm run verify
npm run test:integration
npm run test:e2e
```

`npm run verify` runs, in order: `format:check`, lint, type check, unit and
component tests, and the production build. Run `npm run format` to apply the
formatting. Prettier (`.prettierrc.json`) formats code and JSON only, with a
120-character print width; `.prettierignore` keeps Markdown, workflow YAML and
the `workflow/`, `logs/` and `website/` folders hand-formatted. Run
`git config blame.ignoreRevsFile .git-blame-ignore-revs` once so that
`git blame` skips the bulk reformat commit.

### Test layers

| Layer | Owns | Lives in | Command |
| --- | --- | --- | --- |
| Logic unit | Pure modules and HTTP handlers with fake providers, e.g. ticket diffs, AI parsing | `src/tests/*.test.ts` | `npm test` |
| Component | One React component's behaviour through roles, labels and keyboard in real Chromium, plus axe | `src/components/*.test.tsx` | `npm test` |
| Database integration | Permissions, organisation isolation and RPCs against disposable local Supabase | `src/tests/*.database.test.ts` | `npm run test:integration` |
| Browser end-to-end | Journeys across the server, several components and roles, with the fake AI | `src/tests/browser/*.spec.ts` | `npm run test:e2e` |
| Accessibility | axe-core scans failing on serious or critical violations | component tests and `expectAccessible` in `src/tests/browser/ui.fixture.ts` | both of the above |

Component tests use Vitest browser mode with the Playwright provider
(`vitest.config.ts`, project `component`). They render through
`renderComponent` in `src/tests/render.tsx`, which supplies the app's providers
and stylesheet, and need no Supabase or network. Run them alone with
`npx vitest run --project component`. Eight critical journeys are tagged `@smoke`;
`npm run test:e2e:smoke` runs only those for a fast local check. CI runs the full
browser suite and uploads the Playwright HTML report as the `playwright-report`
artifact on every run.

Browser runs are designed to be repeatable:

- A global setup (`src/tests/browser/global-setup.ts`) visits every page once
  before the tests start, so `next dev` compiles routes up front. Do not edit
  source files during a browser run; the dev server recompiles them mid-run.
- Timers such as banner lifetimes and the autosave debounce are tested with
  Playwright's `page.clock` (`runFor`), not fixed sleeps. Because the installed
  clock also keeps running in real time, give "has expired" checks a short
  timeout. Lint rejects `waitForTimeout` in `src/tests/browser/`; wait for an
  observable condition instead, or use `settleAfter` from `ui.fixture.ts` to
  prove that a held, stale response was ignored.
- CI retries a failed test once and records a trace on that retry. The job
  summary lists failed and flaky (passed only on retry) tests, and traces are
  uploaded as the `playwright-traces` artifact. Treat flaky tests as failures to
  fix. Local runs never retry.
- The suite runs on one worker. Two or four workers sign in faster than the
  app's 30-per-minute auth admission limit (`createAuthAdmission`, one count
  for the single local server process) and fail.
  `SPECFORGE_BROWSER_WORKERS` is a measurement knob for that experiment, not a
  supported setting. `SPECFORGE_TIMING_FILE=<path>` adds a JSON report for
  timing comparisons.

`verify` runs lint, TypeScript, logic and component tests and a production build. Database tests
are explicitly skipped in the ordinary test command; run `test:integration` for
them. Test plan checks are `npx vitest run src/tests/test-plans.test.ts` for the
deterministic provider tests and `node src/tooling/test-local.mjs test-plans` for
the database ones. Both integration/browser wrappers obtain only the named local stack's
configuration and reject any API URL except `http://127.0.0.1:55321`. Fixture admin
access is local-only. Browser tests start their own app server on port 3000. If your manual server is
running, use `SPECFORGE_BROWSER_ORIGIN=http://localhost:3001 npm run test:e2e`
for a separate port and `.next-browser` output directory. They use the local inbox and disposable accounts.
Run type generation/build checks sequentially with browser tests: Next.js rewrites
shared generated type references even with a separate output directory. For
focused request checks, use `node src/tooling/test-local.mjs requests` or
`SPECFORGE_BROWSER_ORIGIN=http://localhost:3001 node src/tooling/test-local.mjs requests-browser`.
The one suite that spends real provider quota is opt-in and never runs in CI:

```sh
SPECFORGE_LIVE_AI=1 npx vitest run src/tests/soc-live.manual.test.ts
```

It makes exactly two calls, one per role feature, and is skipped unless
`SPECFORGE_LIVE_AI=1` and both `SOCLAAS_API_KEY` and `SOCLAAS_CHAT_MODEL` are
set. Run it after changing a prompt, a validator or a stored limit.

Screenshots are ignored under `test-results/`; they are not submission evidence
unless reviewed and summarized. The one-off legacy migration check is
`node src/tooling/test-local.mjs migration` and runs only before the two-field
migration is applied; ordinary tests explicitly skip it. Tests do not call SoCLaaS or hosted Supabase, apart from the opt-in live suite
above.

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

## Email assignee picker

Ticket authors click the Assignees box and type part of a member's email. A
scrollable suggestion list supports Arrow Up/Down, Enter, Escape and mouse
selection. Selected emails appear as removable chips; the five-assignee limit
still applies. Search for your own email to assign yourself. Draft selections
follow autosave; published changes require Update.

Apply `20261108017000_email_assignees.sql` with
`npx supabase migration up --local --workdir src`. The session-authorized
`ticket_members` RPC now returns `{members, selected_members, next_cursor}` with
`{user_id, email, app_role, username}` per member. Email search is case-insensitive,
literal substring matching, capped at 160 characters and 50 results per page.
The HTTP lookup accepts optional `selected` (comma-separated UUIDs, maximum five)
so selected labels resolve independently of search/cursor. Both result groups
are restricted to current members of the requested organisation. Assignment
storage and permissions still use UUIDs.

## Three priorities and shared pill dropdowns

The shared library exports `Dropdown`, `DropdownOption`, `Pill` and `PillTone`;
see `workflow/ui.md` for the fixed-choice interface and keyboard behavior.
Ticket status and priority use its controlled pill dropdowns; reader fields and
list badges reuse `ticket-pills.tsx` so labels and tones stay consistent.

Apply `20261108018000_three_priorities.sql` with the local additive migration
command. It maps urgent to high atomically, increments delivery revision and
updates modification time only for affected tickets, and preserves content
revisions and historical activity. The migration suppresses the activity trigger
only inside its locked transaction to avoid inventing user activity. SQL/HTTP
writes and filters accept only low/medium/high. Earlier migration files and
historical activity values remain intact.

`node src/tooling/test-local.mjs ticket-migration` includes an isolated legacy
priority check in a temporary database inside disposable local Supabase. It
verifies mapping, unchanged unaffected tickets/history and stale-revision
conflicts without modifying the main local database's saved tickets.

## Purple date picker

Ticket due dates use the shared controlled `DatePicker` from `ui.tsx`, wrapping
`@daypicker/react` 10.0.2. DayPicker and its required date-fns and @date-fns/tz packages
are installed from npm with lockfile integrity; no runtime assets are fetched.
The upstream libraries use the MIT license. Install was performed with lifecycle
scripts disabled. Shared Button now has its own module to avoid a circular
import between the UI barrel and DatePicker.

The popover owns pending exact-date text; only valid Apply/day/Today selections
emit a YYYY-MM-DD string, and Clear emits null. Local full-year construction and
calendar-field checks preserve years 0001–9999 and avoid UTC date shifts. Invalid
input preserves the committed date; closing cancels unapplied text. The backend
contract and author permissions are unchanged. The library stylesheet loads
once in the root layout before the purple theme overrides.

Browser coverage uses `setDueDate` through the visible Exact date/Apply controls,
plus calendar day/month/year/keyboard selection, optional dates, save/reload,
negative-timezone/boundary validation and desktop/mobile visual checks.


### Profile username editing

`/profile` composes the shared account menu, controls and unsaved-change guard.
`GET /api/account` includes authenticated Auth `createdAt`; same-origin
`POST /api/account` accepts only `{username}` and returns the current account.
The session-bound `rename_username(new_username)` RPC independently checks
verified identity and updates only its own profile username. Table update grants
remain closed; format/reserved-prefix checks and atomic uniqueness are enforced
in PostgreSQL. Email, application role and creation date cannot be edited here.
The navbar refreshes after profile changes; ticket ownership remains UUID-based.

Apply `20261110001000_profile_username_edit.sql` using the existing migration
workflow. For focused disposable integration coverage, run
`node src/tooling/test-local.mjs profile`; browser coverage lives in
`src/tests/browser/profile.spec.ts`. No live SoC calls are needed.
