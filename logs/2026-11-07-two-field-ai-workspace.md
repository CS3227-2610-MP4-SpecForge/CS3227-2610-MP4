# Session summary: 2026-11-07 / two-field AI workspace design

Human verification: pending
Base: ae7bed4 plus the existing uncommitted request-lifecycle implementation.

- User requested replacing six text fields with title/description, a desktop
  task/chat split view, human-facing AI replies plus optional task updates, and
  spec confirmation before implementation.
- Applied explicitly requested grill-me/grilling guidance. Inspected existing
  approved specs and working-tree status; preserved all uncommitted work.
- User confirmed explicit Apply update for proposals, free-form Markdown with
  optional recommended headings and two-field publication validation, and
  Task/Chat tabs on narrow screens.
- Drafted workflow/specs/2026-11-07-two-field-ai-workspace.md. Existing privacy,
  author permissions, draft autosave and explicit publication remain. Proposed
  lossless conversion of existing five description fields into Markdown.
- User also confirmed stale proposals cannot apply after local text changes;
  keep them visible and regenerate only on explicit request. Consolidated the
  spec with proposal freshness, persistent private chat, publication behaviour,
  lossless migration, safe Markdown, failure handling and public acceptance tests.
- No application/schema/test changes, provider requests or credential reads.
  Documentation whitespace check passed; no runtime checks claimed. No agents
  dispatched. Tool/token/cache/time resource totals were not measured.
- User subsequently approved the consolidated spec for implementation.
  The implementation and evidence follow; no provider quotas are assumed.

## Implementation after approval

- Main agent used local TDD/codebase-design/security guidance. Preserved the
  previously uncommitted lifecycle/account/membership work; no setup reset,
  dependency installation, commit, push or hosted deployment.
- Security preflight returned9concrete controls: lossless migration, private
  chat, authorized provider access, durable admission/idempotency, trusted
  completion, strict output bounds, freshness checks, safe Markdown and durable
  failure handling. Used session-bound reads plus isolated server-only worker
  RPCs; worker begin/finish recheck verified PM/current membership/authorship.
- User explicitly authorized oneGET/models and at most2synthetic chats, each
  <=2,048output tokens/45seconds, no real task data or retries. Discovery found
  configuredqwen3.5:9b and context_length/context_window/max_model_len65,536.
  First2,048-cap check failed or timed out (generic diagnostic, no confirmed
  elapsed time/raw error retained). Second600-cap check: HTTP200,finishstop,
  validchat-onlyJSON,49prompt/33completion tokens,1,733ms measured. No further
  SoC calls were made. This is not a reliability/real-proposal/hosted check.
  Public SoC API guide inspected for endpoint/model-discovery facts; detailed
  docs unavailable through that browsing path. No key or raw response printed.
- App policy is distinct from provider quotas: full serialized context48,000
  UTF-8bytes including system/history/current editor,600output tokens,45-second
  deadline,64KiBresponse; no trimming/retries/fallback. Input/message/proposal
  schemas validate types, sizes and allowed fields. Runtime model whitelist
  matches the verified model. Context-full failures preserve saved work and
  allow manual editing. Provider-wide quotas remain unverified.
- Four additive migrations convert old five description sections into Markdown,
  add private chat/worker admission/completion, allow only the privileged worker
  to invoke the private row validator, and enforce final conversation capacity.
  The one-off migration test reproduced six-vs-two-field RED then passed against
  actual maximum-length legacy Unicode records and empty drafts, preserving IDs,
  authorship, publication state, revisions and timestamps. Local data was not reset.
- Title/description now160/24,000Unicode code points; task bodies192KiB and chat
  bodies256KiB accommodate escaped valid legacy text. Existing lifecycle tests
  were updated to the superseding two-field interface and all9cases passed.
- Chat admission: immutable key/snapshot/message, one active turn/request/account,
  20attempts/account/hour,120-second leases/generations, no direct user writes
  or worker completion. Late membership loss denies storage and response delivery.
  Context is only the current task plus its complete private conversation.
- UI: desktop task/chat columns, mobile state-preserving keyboard-accessible tabs;
  human-only replies do not change task text. Complete proposals require Apply,
  current local snapshot and a fresh server revision check repeated after await.
  Applying clears acknowledgement and follows draft autosave/published manual
  Save rules. Shared text-only Markdown renders headings/lists/paragraphs/code;
  HTML, links and tracking images do not execute/fetch.
- TDD included absent chat RPC/HTTP interfaces, invalid/truncated provider output,
  context denial without provider calls, durable failure/retry, account capacity,
  direct completion denial, expired leases/generations and late access loss.
  Local SQL identifier 'window' initially failed parsing and was corrected before
  applying. Lease fixture update initially lacked private-validator permission;
  an explicit error assertion exposed it, then the service-only grant fixed it.
  Network TypeError initially mapped toinvalid_output; reproduced then fixed to
  unavailable. React lint flagged deferred-load/ref-render issues, corrected;
  lint/TypeScript then passed.
- Code reviewer found2P2defects: an unadmitted unknown send could loop after task
  edits, and the1MiB threshold omitted future completion/metadata bytes. Browser
  RED reproduced the missing recovery path; now explicit reconciled send uses
  current task+same idempotency key and preserves both drafts. Database boundary
  RED admitted a near-full conversation; now admission reserves202,048bytes for
  worst-case escaped completion/metadata and finish checks exact final row sizes.
  All7chatdatabase cases passed after fixes. Both independent reviewers approved
  the fixes with no remaining blocking findings.
- Local worker configuration was necessary for chat: db:env now updates only
  managed local values, including a server-only disposable worker key, preserving
  unrelated.env.local settings and.env. It checks the exact local API target,
  captures CLI output, writes atomically mode0600 and prints no credential values.
  Executed locally; mode/ignore checks passed. Existing port3000dev server kept.
- Routine browser processes use isolated3001+localSupabase and a development-only
  fake-provider flag; invalid fake configuration fails closed, including production.
  No routine test contacts SoC. No model prompt/task/chat content is logged.
- Evidence so far: one-off migration passed;9adapter protocol tests passed;
  full integration passed32cases (16existing+9tasks+7chat). Full Chromium suite
  passed13journeys in34.7seconds, covering existing accounts/membership, task
  lifecycle, Markdown/script/tracking safety, proposal-only vs chat-only output,
  stale local/in-flight/other-editor blocking, mobile tabs, lost chat responses,
  failed retries, published Apply without silent publication and reconciled absent
  send after edits. Desktop/mobile screenshots visually inspected. Final verify
  output follows below.
- Resources: reused2read-only reviewers;5review turns for this slice (security
  preflight/post-change/fix follow-up, code review/fix follow-up), no implementer
  agents or reviewer children. Aggregate tool/token/cache/elapsed savings were
  not measured. Live calls exactly1discovery+2synthetic chats within authorization.
- Remaining release limits: provider reliability/quotas, hosted runtime/SMTP,
  deployment automation, demo kits and partner-owned Developer AI. None claimed
  completed. Human verification of this summary remains pending.

- Final checks: `npm run verify` passed lint, TypeScript,27HTTP/provider protocol
  tests and production build on the final implementation. Its33skipped cases
  comprise32database tests verified separately plus the one-off migration test
  already passed during actual conversion. Git whitespace, ignored environment/
  generated-output checks and versionable-file secret-pattern scan passed.
  Changes remain uncommitted; local migrations and local worker configuration
  applied without resetting data or exposing keys.
