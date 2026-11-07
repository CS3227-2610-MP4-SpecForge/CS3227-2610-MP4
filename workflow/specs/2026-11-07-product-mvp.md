# SpecForge initial product specification

Status: approved by the user on 2026-11-07. Decisions captured on 2026-11-07;
React through Next.js and Supabase selected. Hosting must be free; the exact
provider is deferred subject to an early deployment-compatibility check.
This specification supersedes earlier suggested product features, not the active
lightweight development workflow.

## Purpose and scope

Help a Product Manager (PM) turn rough notes or an idea into a clear feature
request through AI clarification, review/edit it, and submit it to Developers
in the same organisation. Build one web app with shared organisation, identity,
storage, UI and SoC LLM capabilities.

The PM feature is this student's scope. The partner owns the Developer LLM
feature: its requirements and implementation are excluded here. The assignment
still requires an LLM feature for each role; this MVP alone does not satisfy
that requirement. Developer access to submitted requests is included.

## Identity and organisations

- Ordinary signup requires email, password and a permanent PM/Developer role.
  Require email verification before creating organisations or accepting
  invitations. Accounts and authorship use stable account identities; invitations
  target the registered email instead of a username.
- Server-generated demo accounts are preconfirmed, so peer testers need not
  supply personal email addresses or access a mailbox. Each kit supplies one
  isolated organisation, one PM admin, one Developer and sample requests.
  Provisioning interaction, limits and credential handling need security
  preflight and concrete acceptance criteria before implementing this feature.
- Support login/logout. No password recovery, social login,
  account deletion or role changes in the MVP. State the recovery
  limitation at signup and in the User Guide. A replacement account inherits
  no previous data or memberships; organisation admins cannot reset passwords.
- An account can belong to multiple organisations and select its active one.
  Either role can create an organisation, supplying a name, and becomes its
  first admin. Names need not be globally unique; access uses stable identities.
- Application role and organisation admin status are separate. Admin status
  grants membership management, not PM authorship/editing permissions.
- Admins invite existing registered accounts by email. No global
  browsable account directory. Invitations grant no access until accepted by
  their intended recipient; recipients can accept or decline. Invitations expire
  after seven days. Admins can view/cancel pending invitations and resend expired
  ones. Invitations are visible only to the recipient and that organisation's
  admins.
- Admins can view members, remove members, promote members to admin and revoke
  admin status. Members can leave. Every organisation must retain at least one
  admin: block the last admin's departure, removal or demotion until another
  member is promoted. Concurrent changes must preserve this invariant.
- Requests belong directly to organisations. No project entity in the MVP.

## PM workflow

1. A PM member starts a private conversation for one feature request in the
   selected organisation, using typed/pasted text, including code snippets.
2. The AI clarifies requirements in focused, small rounds. When it judges them
   clear, it produces a structured draft. The PM can request an earlier draft;
   unresolved questions and assumptions must be explicit, not invented answers.
3. The draft has six editable fields: title; problem and intended user; desired
   behaviour; acceptance criteria; out of scope; assumptions and unresolved
   questions. Conversations and unsubmitted drafts autosave and can be resumed.
   Show saving, saved and failed states accurately.
4. The PM reviews/edits the draft and explicitly submits it. All six fields
   require content, with "None" acceptable where appropriate. The PM must
   explicitly acknowledge any remaining assumptions or unresolved questions.
   AI approval is never a prerequisite.
5. Submission publishes the request to all current members of that organisation.
   The original PM author alone can edit it. Submitted edits require explicit
   Save changes, satisfy the same validation/acknowledgement rules, and become
   visible immediately after successful save. Readers see the last saved version
   while editing is in progress. Display submission and last-modified timestamps.
6. AI revisions use the current request and its conversation and produce a
   proposed replacement. Only explicit PM application replaces the editable
   draft; it never silently overwrites manual edits or publishes changes.
7. Authors can delete private drafts after confirmation. Submitted requests and
   organisations cannot be deleted in the MVP.

Draft requests and AI conversations are private to their PM author, including
from organisation admins. AI conversations remain private after submission.
Submitted requests retain their author and remain visible when that author
leaves or is removed. Membership loss immediately removes access to that
organisation's requests/conversations; private drafts persist but become
inaccessible. Rejoining restores the author's access and editing rights.

## Developer and shared UI workflow

Members can list/view their organisation's submitted requests, including all six
fields, author, submission time and last-modified time. Developers cannot create
or edit PM requests, even when admins. Other PMs also cannot edit an author's
requests. No assignment, comments, implementation status, notifications, revision
history, collaborative drafting or issue-tracker integration in this MVP.

Use one app shell and shared components/theme tokens for both roles, following
`workflow/ui.md`. Include clear organisation selection and shared loading, empty,
validation, access-denied, error and saving states. Check keyboard use, focus,
labels and responsive layouts. Select a representative screen/theme before
building separate role pages.

## AI, security and resource requirements

- Use NUS SoC LLM through server-side calls with server-held credentials. Context
  is limited to the current request's notes, conversation and current draft;
  exclude other requests and organisation data. No uploads, repository access,
  browsing or AI actions outside clarification/text proposals.
- Treat notes, snippets, conversation and generated output as untrusted data.
  Distinguish confirmed requirements from assumptions; safely render output and
  validate its structure. AI text cannot grant privileges or execute actions.
- Enforce authentication, current membership, role and authorship on the server
  before every protected read/write or provider call. Scope all lookups to the
  authorised organisation; UI visibility and prompts are not access controls.
- Protect passwords and sessions using established security mechanisms selected
  with the stack. Bound authentication/invitation abuse as well as AI use. Keep
  credentials, passwords and sensitive request/conversation content out of logs.
- Bound AI input, context, output, request duration, concurrency and per-account
  usage. Verify actual SoC capabilities before selecting numeric limits and
  context-retention rules; no guessed quotas. Show actionable limit messages.
- Provider failures preserve saved work, show a clear error and allow manual
  retry and continued manual editing. No automatic retry loops. AI cannot submit,
  save published changes, invite members or change permissions.

## Acceptance and testing interfaces

Approve these public behaviour boundaries with this specification; exact APIs,
schema, numeric bounds and commands follow stack/provider investigation.

- Identity/session boundary: email signup, duplicate-account handling, permanent
  role, verification and its organisation-access restrictions, login/logout,
  invalid credentials and unauthenticated access. Verify that public signup
  cannot select demo-account preconfirmation. Recovery absence and signup
  guidance must match actual behaviour.
- Organisation boundary: creation by either role, independent memberships/admin
  status, invitation recipient/expiry/acceptance/cancellation, member removal,
  leave and last-admin invariants, including competing membership changes.
- Request boundary: private draft/conversation access, autosave/resume,
  validation and acknowledgement, explicit submission, author-only submitted
  edits, last-saved visibility, timestamps, deletion restrictions, access loss
  and restoration on rejoining. Test PM, Developer and admin combinations.
- Isolation boundary: use at least two organisations and disposable accounts;
  direct identifier substitution must not expose or mutate another
  organisation's drafts, conversations, requests, invitations or AI context.
- AI adapter boundary: substitute a deterministic fake provider in routine
  tests. Cover clarification/draft responses, explicit revision application,
  malformed output, timeouts/failures and exceeded limits. Confirm denied calls
  never reach the provider. Test malicious notes/output and safe rendering;
  do not claim universal prompt-injection resistance from sample tests.
- Browser journeys: PM clarification through submission and later editing;
  Developer viewing; invitation and membership controls; failure recovery;
  keyboard/responsive/shared-state checks across both roles.
- Live SoC integration checks must be explicitly bounded and authorised; routine
  automated tests do not consume live quota. No existing checks are claimed.

## Delivery and engineering constraints

Use the active lightweight workflow: main-agent implementation with TDD and
codebase-design guidance, independent code/architecture review at feature
boundaries, and security preflight/post-change review for sensitive changes.
Share authentication, organisation authorisation, persistence and the SoC
adapter rather than duplicating them across roles. Keep application source
under `src/`; do not scaffold before product approval and stack discussion.

Hosting must remain free. Deploy online to separate development/production environments using team-managed
automation, such as GitHub Actions, with separated credentials and appropriate
deployment permissions. AI build-and-host environments are prohibited.

The public team-organisation repository is `CS3227-2610-MP4`. Submission includes
`src/`, consolidated `workflow/`, `docs/UserGuide.md` (current features and
testing/access), `docs/DeveloperGuide.md` (design/process/acknowledgements),
`docs/Reflections.md` (concrete multi-agent, context and resource experiments),
human-verified sanitized summaries under `logs/`, and a product website hosted
on GitHub Pages. Product-website content and the partner's Developer feature
remain separate deliverables to define; their completion is not claimed here.

## Approval and next gate

Product approval received. Next discuss stack and verify
SoC integration constraints; resolve concrete authentication/session mechanisms,
usage/context limits and test interfaces before implementing affected behaviour.
React through Next.js and Supabase are selected. Defer the exact free hosting
provider, but check runtime support, SoC reachability, request-duration limits,
email delivery and separate-environment capacity before depending on them.

## Selected technical direction and demo access

After product approval, the user selected React for the frontend, Supabase for
the backend and email-based accounts instead of username-only accounts. This
supersedes the earlier username-only identity/invitation decisions. The user asked
to investigate Homebrew's generated demo-account kits for peer testing, then
approved one organisation, one PM admin, one Developer and sample requests per
kit. The detailed provisioning workflow remains to be settled.
Ordinary email verification and preconfirmed generated demo accounts are agreed.
Password recovery remains excluded unless explicitly changed. Next.js is the
selected application runtime/framework; other approved product rules remain.

The user supplied a SoCLaaS integration guide: base URL
`https://soclaas-api.comp.nus.edu.sg/v1`, Bearer authentication, model discovery
through `/models` and generation through `/chat/completions`. These are supplied
connection details, not successful access checks. Model access, optional
parameters, quotas, latency and reachability from the eventual host remain
unverified. Keep configuration server-only and routine tests deterministic;
do not copy another project's key or assume its historical model choices,
token budgets, fallback policy or retrieval features apply. The agreed
manual-retry product behaviour remains in force.

## First implementation slice: concrete interfaces

Status: implemented and independently reviewed for local use; hosted release
gates remain open. See the guides for current setup and the session summary for
actual test/review evidence. This is not completion of the full product MVP.

The user authorised implementation after approving the product and stack.
Implement signup/verification/login/logout and organisation creation/list/detail
first; membership invitations and PM/AI requests remain subsequent slices.
Tests exercise the already approved identity, organisation, isolation and
browser seams through these public interfaces:

- Same-origin JSON POST `/api/auth/signup`, `/api/auth/verify`,
  `/api/auth/signin`, `/api/auth/signout` and `/api/auth/resend`.
  Verification uses an emailed one-time code entered explicitly, avoiding
  verification credentials in application URLs. Role is selected only at signup.
- Authenticated GET/POST `/api/organisations` and GET
  `/api/organisations/[id]`; creation accepts a name and atomically adds the
  creator as admin. Organisation IDs never confer access without membership.
- Supabase's public Auth interface and session-bound database interface/RPCs:
  test actual verification, role immutability, RLS and atomic creation against
  disposable local Supabase. No service key in ordinary app paths.
- Browser journeys cover both roles using shared account forms/app shell,
  verification, login/logout, creation and organisation selection. Routine
  provider-failure tests substitute external Supabase transport; database
  isolation tests use real local Supabase, not mocked policy assertions.

Concrete limits for this slice: JSON bodies at most 8 KiB; organisation names
1–80 trimmed characters; passwords 12–128 characters; email at most 254
characters; verification codes 6–10 digits (local emails use eight).
Provider rate limits protect Auth; hosted configuration and email delivery must
be checked before online release. Mutations check a configured trusted origin.
