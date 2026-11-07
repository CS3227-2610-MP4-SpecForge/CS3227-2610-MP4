# Two-field task editor and AI workspace

Status: approved by the user on 2026-11-07; implemented and independently
code/security reviewed for local use. Supersedes
the six-field editor portion of the product/request-lifecycle specs.

## Confirmed decisions

- Exactly two editable task fields: title and description. Description is
  free-form Markdown, not a hidden set of separately validated fields.
- AI descriptions normally use headings such as Problem description, Desired
  behaviour, Acceptance criteria, Out of scope, and Assumptions / unresolved
  questions. Those headings are optional; submission validates nonempty title
  and description rather than individual segments.
- Desktop has two columns: task editor left, AI chat right. Narrow screens use
  Task / Chat tabs; switching preserves both panels' state.
- Each successful AI turn has a human-facing chat reply and may also have a
  complete proposed title/description update. Clarification-only replies leave
  the task untouched.
- AI task updates require an explicit Apply update action before replacing the
  current editor content. No silent replacement or publication.

## Existing rules retained

Verified PM authors alone edit or chat on their request. Chats and drafts remain
private to the author, including from admins and after publication. Current
membership is checked server-side for every read/write/provider call. Developers
and other PMs read submitted requests; they cannot access the author's chat.

Drafts autosave and resume; publication and published edits require explicit
submit/save with review acknowledgement. Applying an AI proposal to a draft
becomes an ordinary local edit subject to autosave; applying it to a submitted
request changes the author's local editor only until explicit Save changes.
Existing revision/conflict protection and membership-loss/rejoining rules remain.

Use SoC LLM server-side, with context limited to this request's current editor
content and its private conversation. Provider output is untrusted and validated;
it cannot execute actions, grant access, save published changes or submit.
Provider failure preserves saved task/chat work, allows manual retry and keeps
manual editing available. Routine tests use a fake provider, never live quota.
Actual model/context/output/usage limits need verification before AI coding;
no provider limits are invented in this draft.

## Migration and display

Preserve existing saved requests through a lossless migration: keep title and
compose the other five fields into description headings and content. Preserve
IDs, authors, publication state and timestamps; do not drop existing text.
New persistence/HTTP contracts use title and description, not six hidden fields.

The description editor is a Markdown textarea. Submitted readers see safely
rendered headings, lists, paragraphs and code; raw HTML is not executed. The
chat shows human replies and a pending task proposal with Apply update. Proposals
never count as applied/saved content until the user applies them.

Public test seams: strict authenticated HTTP, real local Supabase RPC/RLS,
server-side SoC adapter with deterministic fake transport, and browser journeys.
Cover lossless migration, two-field validation, author/chat privacy, cross-org
IDs, no provider call after denial, clarification-only responses, proposal apply,
stale proposals, provider/schema failures, manual fallback, persistence/resume,
explicit publication, safe Markdown, keyboard use and responsive tabs.

## Proposal freshness and chat persistence

Bind each proposal to the task revision and exact editor content supplied to
that AI turn. If either has changed, keep the proposal visible but disable Apply
update and explain that it is outdated. Do not offer a force-overwrite action.
A fresh proposal is generated only on explicit user request, never automatically.
Applying a fresh proposal replaces both task fields and resets publication-review
acknowledgement; it does not submit or save published changes.

Use one persistent, author-private conversation per request, resumable alongside
the task. Sending a message produces a human reply with an optional task proposal;
users may explicitly request a draft earlier instead of waiting for clarification
to finish. Preserve editor text typed while the AI is responding. Prevent
concurrent AI turns for one request; allow continued manual task editing.
Failed turns have a clear failed state and explicit retry, without duplicate
successful chat turns or uncontrolled provider retries. Saved work survives
provider/network errors. No messages or task contents go into application logs.

## Acceptance and implementation gates

- The author sees two task inputs and a chat pane side by side on desktop;
  mobile Task/Chat tabs retain both panels' contents and accessible focus.
- Free-form descriptions can publish without mandatory internal headings; title,
  description and explicit review acknowledgement are required. Draft autosave,
  submitted explicit Save changes and revision conflicts retain their meaning.
- A chat-only response never changes the editor. A task proposal changes neither
  persisted task content nor published content until Apply update is chosen;
  subsequent draft autosave or published Save changes follows ordinary rules.
- Stale proposals cannot apply, including edits made while a response is in
  flight or another editor saving a newer revision. No new provider call is
  made merely because a proposal becomes stale.
- Request/chat/proposal reads and mutations, including provider calls, enforce
  verified identity, current membership and author ownership. Recheck access
  before storing a late provider response after membership loss. Chats remain
  author-private after submission. Readers see only the saved title/description.
- Malformed, truncated, timed-out or rejected AI output shows an actionable
  error and leaves saved content intact. Only validated chat text and optional
  title/description proposals are rendered; raw provider errors are not exposed.
- Existing six-field records migrate without content loss. Keep the title limit
  at160 characters; description capacity must accommodate all five old fields
  plus headings. Final storage/transport limits must preserve valid old records.

This is product and public-test-interface approval. Before coding the AI adapter,
security preflight must establish bounded input/context/output, deadlines,
per-account usage/concurrency and retry settings against verified SoC capability.
No provider quota, model limit or live integration success is claimed here.
If that investigation requires a product trade-off (for example omitting older
conversation context), return for an explicit decision rather than silently
changing this spec. Live provider checks require a separately bounded authorised
check; routine tests remain deterministic and offline from SoC.

Implement in the main agent with TDD/codebase-design, then independent code and
security reviews, shared UI/browser checks and updated guides/session summary.
No application changes, credentials access or live provider calls during this
requirements interview. Demo kits, hosting/deployment and the partner-owned
Developer AI remain outside this slice.

## Verified technical envelope and concrete interfaces

Implementation preflight: authorized model discovery reported65,536context tokens
for configuredqwen3.5:9b. First synthetic check (2,048output-token cap) failed or timed out under
a45-second deadline; second (600cap) returned HTTP200/stop with valid chat-only JSON,
49prompt/33completion tokens. No further live checks were made. These are limited
compatibility observations, not a reliability guarantee or verified provider-wide
quota. Public reference: https://soclaas.comp.nus.edu.sg/guides/api.html.

App policy: title160/description24,000 Unicode code points; task bodies192KiB;
chat bodies256KiB; user messages4,000characters; no separate AI reply character ceiling; full serialized context
48,000UTF-8bytes including system instructions/history;2,000output tokens;
60-second provider deadline;64KiBprovider response; no automatic retries,
fallback or silent context trimming. Full context/storage produces a clear
failure with manual editing available. One active turn/request/account,
20admissions/account/hour,120-second leases/generations; conversation storage
1MiB with worst-case completion space reserved and exact final-size enforcement.
These caps are application choices within observed capabilities, not SoC quotas.

Request APIs keep existing actions with exactly `{title,description}` fields.
GET/POST `/api/organisations/[org]/requests/[id]/chat` read/send the author's
conversation. POST accepts `{key,revision,fields,message,retry}`; no actor,
history, model or prompt override. Session reads authorize before constructing
a privileged server worker; service-role-only admission/completion recheck
membership/ownership and generation. Normal task operations remain on the public
session client. An absent reconciled send can explicitly update its snapshot
using the same idempotency key; a racing old admission rejects changed input.

Local tests use an explicitly guarded development-only fake provider and local
worker key. The one-off migration test passed against maximum-length Unicode
legacy fields, preserving all content and record metadata. Guides describe the
server-only worker configuration and remaining hosted/provider reliability gates.

Timeout amendment: user explicitly increased the local provider deadline to60seconds; browser wait remains75seconds and worker lease120seconds. Historical probe deadlines above remain unchanged.


## Approved debugging limits amendment — 2026-11-08

User explicitly requested removing the 4,000-character AI reply limit and raising
the output budget from 600 to 2,000 tokens. Apply this to the SoC request, system
prompt and reply validation/storage. Replies must still be nonblank strings;
strict output shape and proposal limits remain. Outgoing user messages retain
their separate 4,000-character limit. Keep the 64KiB provider response body cap,
48,000-byte full context limit, 1MiB conversation cap, existing authorization,
rate limits and deadlines. Reserve adequate completion storage before admission.
No live provider calls are needed or authorized by this amendment.

Use the previously approved provider and authenticated HTTP/local Supabase RPC
test seams: accept/persist/reload replies exceeding 4,000 characters, assert the
2,000-token request, reject blank/malformed/truncated output, and retain capacity
and access controls. This is a debugging policy, not a verified SoC quota.
