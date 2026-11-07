# Debugging invalid Draft ticket responses — 2026-11-08

Human verification: pending. Reviewed working changes after 980130e; preserved
all earlier uncommitted ticket-first and debugging-limit work. User reported the
Draft ticket button returned a generic incomplete/invalid response and requested
debugging. Used existing approved provider/HTTP/local-RPC/browser test seams and
local TDD, codebase-design and security skills. Recorded scope in
workflow/specs/2026-11-08-invalid-ai-output.md.

## Evidence and diagnosis

The old adapter discarded the specific invalid-output reason, so the original
failed response cannot be reconstructed. Two bounded synthetic requests used the
configured SoC model with a generic filter-persistence idea, 2,000 output tokens,
60-second deadlines, no automatic retries or real task content. Only allowlisted
shape/status/length metadata was printed; no raw model response, hidden reasoning
or credentials were retained.

- Prompt-only baseline: HTTP200, finish_reason stop, 45,863ms, 3,517 response
  bytes, 2,972 content characters; content was not valid JSON. This reproduces a
  current failure independently of truncation/timeouts, not the historical cause.
- Same request plus response_format=json_object: HTTP200/stop, 2,389ms, 639 response
  bytes, valid structured human reply with proposal=null. This confirms JSON-mode
  compatibility, not successful complete-ticket generation or reliable latency.

Official Ollama OpenAI-compatibility documentation lists response_format support:
https://docs.ollama.com/api/openai-compatibility . SoC acceptance was measured
rather than inferred from a model name. No third provider request was made.

## Fix and tests

The adapter now explicitly requests JSON object mode and still validates reply
and optional complete proposal strictly. Empty tool-call lists are accepted;
actual/non-array tool calls fail without execution. Invalid output has fixed
reason metadata: truncated, invalid_json, invalid_schema, invalid_envelope,
missing_content, tool_calls, unexpected_finish, body_limit or unsafe_section.
Parse exceptions, Zod paths, arbitrary provider fields and reasoning are omitted.
Shared rendering gives actionable reason-specific notices on new failed turns.

An additive local migration updates diagnostic validation, preserving historical
invalid_output/null rows while binding new source/reason to the failure code and
rejecting extra keys. Applied without data reset. Worker permissions, private
access, retry clearing, output/context/storage/rate caps, 60/75-second waits and
explicit publication remain. Updated developer/user guides.

REDs: safe-reason assertions failed without metadata; wire assertion failed
without response_format; empty-tool-list response was incorrectly rejected;
HTTP/database persistence failed before the diagnostic migration. GREEN:
- npm run verify: lint/typecheck, 40 unit tests and production build passed;
  39 database/migration tests skipped in that unit invocation.
- npm run test:integration: all 38 local database tests passed, including strict
  diagnostic rejection, historical nulls, private reload and clearing on retry.
- Three focused browser journeys passed in 10.4s: durable distinct failures,
  rough-idea draft/undo/review, and lost first-draft response recovery. Browser
  tests used the local fake AI and isolated port3001. No user server was stopped.
- git diff --check passed.

Independent security preflight and code/security post-reviews approved with no
findings. Reviewer agents were read-only and made no live calls. Live SoC calls:2;
retries:0. Total coding-agent tokens/cache use and total elapsed time unavailable.
No commit/push requested. User can refresh and try Draft ticket again; older
failures remain generic because their diagnostic detail was not captured.
