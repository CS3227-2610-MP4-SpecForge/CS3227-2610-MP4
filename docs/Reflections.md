# SpecForge Reflections

## Initial requirements and provider exploration

Small interview rounds settled the PM workflow before a stack or scaffold was
chosen. User feedback materially changed two assumptions: submitted requests
remain editable, and organisation-wide membership replaces a project entity.
Username-only signup was later replaced explicitly by email verification and
future generated demo accounts. One product specification holds the decisions.

One authenticated model-discovery request succeeded. Two synthetic Qwen checks
then used the same 600-token completion cap. The first took 10.16 seconds,
reported 734 total tokens, returned no visible content and ended for length.
A diagnostic with `reasoning_effort: none` took 5.76 seconds, reported 416 total
tokens, and returned visible content with normal completion. Neither passed
strict direct six-field JSON validation. This is one small experiment, not a
general performance comparison or proof that the optional setting is always
honoured. It motivates schema validation and explicit truncation handling in the
future adapter. No production feature uses these probe results as a guarantee.

## First implementation slice

The main agent writes the implementation; a separate security agent supplied
preflight criteria without reading `.env`, making provider calls or changing
files. Those criteria became verified identity checks, protected fixed roles,
database confirmation checks, RLS and atomic creator-admin provisioning.
Independent post-change reviews and their outcomes are recorded in the session
summary. This document does not treat the preflight itself as security proof.

TDD used public HTTP and Supabase interfaces. Observed RED cases included missing
signup/verification/organisation routes, missing creation RPC, absent auth
attempt limits and provider outages incorrectly mapped to invalid credentials.
Implementation then made the focused cases pass. Direct local-Supabase tests
check controls that mocked provider responses cannot establish.

Resource/context choices: reviewers receive scoped files/specification and test
evidence rather than a conversation dump; main-agent implementation avoids
parallel writers; routine tests use disposable local Supabase or external
transport fixtures, not live SoC quota. Repeated broad checks are reserved for
feature completion or a material fix. Token/cache/time savings from this process
have not been measured; no saving percentage is claimed.

Setup exposed concrete tooling issues: the newest Supabase CLI rejected the
inbox configuration, so a compatible CLI was pinned; Docker was initially
stopped; npm audit identified a lint-tool transitive dependency, corrected with
a targeted patched-version override. A local CLI diagnostic printed disposable
local development credentials once; the new wrappers suppress credential-bearing
success/error output. No hosted or SoC credential was printed. This illustrates
why output handling needs executable controls rather than instructions alone.

## Manual request lifecycle

The next slice kept manual authoring separate from the unverified AI adapter.
Public database/HTTP tests exercised revision races and membership loss; browser
transport interception simulated failures before a write and response loss after
commit. This distinction exposed why retrying blindly is unsafe. Creation uses
an account/organisation-scoped key, and saves reconcile the stored revision while
preserving newer local text.

Independent code review found gaps that the initial successful browser journey
missed: browser history could bypass unsaved-work warnings, skip-link navigation
could disable later protection, and PostgreSQL's locale whitespace classification
differed from JavaScript trim for FEFF. New regressions reproduced all three;
fixes use document entry into editors/native unload protection, ignore same-page
hash departures, and enumerate trim whitespace in storage validation. NBSP was
already rejected in the local database; it remains a regression case alongside
FEFF. These are concrete findings, not an assumed review benefit or security proof.

Reviewers stayed read-only and received the approved spec, scoped files/diff and
execution evidence. Main-agent implementation preserved one writer. No live SoC
quota was consumed and no measured token/cache/time-saving percentage is claimed.

## Two-field AI workspace

The user changed the six separate fields into title/Markdown description and
requested a task/chat split view. The short requirements interview confirmed
explicit Apply, optional headings, mobile tabs and stale-proposal blocking before
coding. A real additive-migration test preserved maximum-length legacy Unicode
content and metadata, rather than assuming concatenation and new limits fit.

The authorized model discovery reported65,536context tokens. The first synthetic
chat failed or timed out under a45-second deadline; the smaller second check returned a valid chat-only
JSON envelope with49prompt/33completion tokens. No real task data was used.
Those checks support bounded integration, not broad reliability claims. Routine
protocol, database and browser checks use deterministic transports/fake AI.

Security preflight led to service-role-only worker admission/completion after
session authorization, durable idempotency, account/request reservations and
lease generations. Code review identified an unadmitted-send recovery loop after
manual edits and an incomplete storage-cap calculation. Regressions reproduced
both; explicit current-snapshot recovery and reserved/exact completion capacity
resolved them. Unknown network outcomes are treated differently from a definitive
failed turn. No measured token/cache or time-saving percentage is claimed.
