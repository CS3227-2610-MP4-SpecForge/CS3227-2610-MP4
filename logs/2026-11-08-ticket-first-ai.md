# Ticket-first AI writing — 2026-11-08

Human verification: pending.
Revision reviewed: working changes after 980130e, including new files; earlier
uncommitted AI debugging-limit work and generated Next type-reference changes
were preserved. No commit or push was requested for this slice.

## Requests and decisions

User described SpecForge as Jira-like tickets with AI writing assistance and
found the separate chat/proposal/apply flow difficult. Main agent proposed rough
idea to first draft, a ticket-centered editor, targeted writing actions, questions
only when useful, inline change review and secondary discussion. User approved
implementation. Saved concise approved behaviour and existing public test seams
in workflow/specs/2026-11-08-ticket-first-ai.md. Main agent used local TDD,
codebase-design and security skills; no setup/scaffolding restart.

## Implementation

- Rough ideas autosave privately in description; Draft ticket fills a fresh
  private editor with a session-local Undo action. Start manually is always
  available. Recovered/historical results require review rather than auto-fill.
- Main title/description editor with Improve clarity, Add acceptance criteria and
  Find missing details. A collapsible discussion keeps typed text/state and one
  composer. Leave undecided requests an explicit unresolved decision; answer
  options are readable chat text, not model-generated selection controls.
- Literal removed/added suggestions in the editor with Accept changes/Discard.
  Existing published edits still require acknowledgment and explicit Save.
- Shared immutable action messages reuse existing authorization, rate limits,
  idempotency, worker RPCs and private history. No new database schema is required
  by the redesign. Earlier debugging policy remains 2,000 output tokens, no reply
  character ceiling, 64KiB provider body cap and existing context/storage/timers.
- Server-side acceptance-section merging preserves title and outside content;
  question-only action suppresses proposals. Ambiguous/unsupported structural
  headings, code fences, missing criteria and over-limit merges fail safely.
- Updated user/developer guides, README and current-state instructions. Shared
  controls/tokens remain consistent with account/Developer pages.

## TDD and independent reviews

Provider/database action regression first failed because broad generated changes
were stored unchanged. Added server scoping and verified GREEN through the strict
HTTP/local Supabase seam. Browser rough-idea journey first failed on the missing
starter; implementation passed. A held-read regression then demonstrated manual
mode takeover could still auto-fill; added a live mode predicate checked after
remote freshness validation.

Independent security preflight and separate code/security post-reviews were
read-only, with no live provider calls or credential access. Reviews found three
P2 defects: first-draft freshness-read failure left the manual editor hidden;
Discard could race a pending acceptance; unsupported later section headings could
be swallowed by targeted replacement. Each received a failing public regression
before fixes. Recovery now opens manual review; a live suggestion identity guard
cancels discarded/replaced pending acceptance; unsupported bold/setext section
structure is rejected outside fences. Both reviewers approved after one rework
round with no remaining findings.

## Verification

- npm run verify: lint, type checking, 34 unit tests and production build passed;
  38 database/migration tests skipped in the unit-only invocation.
- npm run test:integration: all 37 local database tests passed, including long
  replies, access controls, targeted preservation, fences/ambiguous headings,
  merged length checks, question-only suppression and aggregate storage limits.
- Final complete browser suite: all 21 journeys passed (1.9 minutes), including
  PM/Developer accounts/membership, private drafting/publication, mobile layout,
  targeted edits, Undo/stale protection, lost responses, manual takeover, failed
  freshness-read recovery and cancellation of pending acceptance via Discard.
  Desktop editor and mobile Developer-reader screenshots were visually inspected;
  inline review screenshots also captured for desktop/mobile.
- git diff --check passed. Browser tests use an isolated local server on port3001
  and a fake external AI; the existing port3000 server was preserved.

Two independent reviewer agents were used (security preflight/post-review/rework,
code review/rework). Live SoC calls: zero. Coding-agent token/cache measurements
and a reliable total elapsed-time measurement were not captured. Synthetic tests
verify controls and interaction, not live model reliability or provider quotas.
