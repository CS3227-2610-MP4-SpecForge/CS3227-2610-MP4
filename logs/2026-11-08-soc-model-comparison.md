# Qwen/Gemma comparison and local model selection — 2026-11-08

Human verification: pending. User authorized modifying the model in .env and
comparing Qwen/Gemma. Baseline source commit2febb62; all prior uncommitted guide,
verification/variant specs and logs preserved. Scope/rubric recorded before calls
in workflow/specs/2026-11-08-soc-model-comparison.md. Old committed prompt retained.

## Discovery and method

One authenticated fixed-origin GET/models returnedHTTP200 in169ms. Bounded to
15seconds/256KiB, no redirects/retries; only matching public IDs/numeric context
metadata printed. Selected qwen3.5:9b (reported65,536context) and gemma4:26b
(reported131,072context). Several other Qwen variants listed but not selected.
Reported contexts accommodate unchanged48KB serialized message/2,000 output caps;
this is not provider-wide quota or backend identity attestation. Models differ
in parameter size, so results compare these deployments rather than families.

Five fixed synthetic cases paired Qwen first then Gemma: clear draft, material
unknowns, clarification, clarity, acceptance. Same fields/messages/empty history,
old system prompt,JSON mode,reasoning_effort:none,max_tokens2000,60sdeadline,
48KB context,64KiB body caps. Only model ID varies. Actual createSocProvider and
section constraint retained. Ten generation attempts maximum, serial, no retry,
plus the separate discovery read. No automatic fallback/model-specific repair.

Temporary harness loads process > .env.local > .env, forwards real adapter wire
and signal and uses bounded pass-through metadata observation. No raw envelopes,
credentials, hidden reasoning or real tickets printed/stored; inspect only
canonical validated synthetic output and allowlisted structural/failure metadata.
No user task/chat/database changes. Paired single observations/fixed order/empty
history limit conclusions; no claimed reliability rate or causal latency advantage.

Safe env inspection found .env selectsqwen3.5:9b, .env.local has no model assignment,
and this shell has no process model override. Both env files are ignored by Git.
No env secrets were displayed or sent to reviewers. Final selection is recorded
below after evidence. Runtime at baseline separately rejected all models but Qwen;
env-only editing would not enable Gemma in the application.

## Main-agent implementation and deterministic checks

Gemma returned a valid structured unknowns proposal and a human-only clarification
with unchanged params/caps, establishing limited compatibility before enabling it.
Main used local TDD/codebase-design and security skills at approved provider/HTTP
seams. Unsupported-model regression first RED: provider contacted fake transport
and resolved instead of rejecting configuration. GREEN: move exact allowlist from
runtime into createSocProvider validation, allow only qwen3.5:9b/gemma4:26b, and
pass server-side environment model from runtime without duplicate policy.

No prompt, output normalizer, auth/private-worker logic, client inputs, editor,
section merging, storage or publication change. No broad model prefixes/dynamic
model lookup in ordinary requests, no URL change, retry or fallback. Test-only
fixture model labels now use the supported Qwen ID with synthetic credentials.
Both exact IDs tested for2000-token JSON request,60-second deadline/no-store/no
redirects and context rejection before transport. Unknown, missing and even
other discovered-but-untested model IDs fail configuration before transport.

Provider tests:55passed. npm run verify:lint/typecheck,74deterministic tests and
production build passed (41DB/migration tests skipped in ordinary invocation).
npm run test:integration:all40localDBtests passed in11.63seconds, including real
HTTP orchestration + fake external transport normalization/private reload/safe
failure/unchanged saved draft for each exact model ID. No live calls in routine
tests. No UI changes; browser fake journeys were not artificially repeated.

Independent code reviewer approved exact source/test diff without findings,
confirming centralized pretransport selection and unchanged caps/controls. That
review does not endorse either model's quality or final environment selection.

## Live comparison results

Ten generation dispatches completed, plus one discovery read. Each model had
three normalized outputs and two local timeouts. Qwen's normalized outputs were
two proposals and one refusal-only reply; Gemma's were two proposals and one
useful clarification. All six received generation responses wereHTTP200/stop.
Timeouts have no HTTP response metadata. No malformed-output rejection, body/
context overflow or missing-reply fallback occurred in this run. One Qwen
proposal had one extra key stripped. No automatic retries or model fallback.

| Call | Case / model | App-observed ms | Format result | Semantic assessment |
| --- | --- | ---: | --- | --- |
| 1 | Clear / qwen3.5:9b | 5,988 | Complete proposal | Retained filter/reload/All/permissions, but invented non-PM visibility rules, session/network behavior and extra implementation questions. Not faithful. |
| 2 | Clear / gemma4:26b | 60,004 | local_timeout/local_deadline60004 | No usable output to assess. |
| 3 | Unknowns / qwen3.5:9b | 6,785 | Complete proposal, one extra proposal key stripped | Explicitly left both choices open, but Desired behaviour already chose current-filter rows; contradicted unresolved scope. |
| 4 | Unknowns / gemma4:26b | 20,711 | Complete proposal | Both column/filter choices explicitly open; Desired behaviour refers to currently displayed requests, leaving some ambiguity against undecided scope; added reporting rationale/email exclusion. More focused, not fully proven faithful. |
| 5 | Clarification / qwen3.5:9b | 60,005 | local_timeout/local_deadline60005 | No usable output to assess. |
| 6 | Clarification / gemma4:26b | 2,097 | Human reply, proposal=null | Asked only requested export-format question with readable options. Meets this observation's rubric. |
| 7 | Clarity / qwen3.5:9b | 60,002 | local_timeout/local_deadline60002 | No usable output to assess. |
| 8 | Clarity / gemma4:26b | 60,003 | local_timeout/local_deadline60003 | No usable output to assess. |
| 9 | Acceptance / qwen3.5:9b | 2,187 | Human reply, proposal=null | Refused request, no reviewable criteria. Valid chat schema is not successful writing. |
| 10 | Acceptance / gemma4:26b | 54,895 | Complete proposal; exact title/original-prefix preserved | Covered reload/permissions but inserted unrequested cache-reset criterion and omitted All-reset criterion. Merge succeeded; criteria fail fidelity rubric. |

These observations do not establish why a call timed out. No provider-side
processing duration, cold-start behavior, queueing or model internals was inferred.
Request IDs/model names are API selections, not independent backend attestation.
Acceptance observations cover appending criteria to a fixture without an existing
criteria section; other merge/storage controls remain deterministic evidence.

## Local selection and configuration

Retain .env default qwen3.5:9b. Evidence is mixed: both models timed out twice,
Gemma produced useful clarification and a complete acceptance section but the
criteria were still incorrect. Neither passed the full writing rubric, and both
clarity requests timed out. No overall quality/reliability winner established.
User's permission to edit .env did not require selecting a worse or unproven
default; no env-file writes were needed. Effective public model ID rechecked
without printing secrets. .env.local/process do not override it in this shell.

Both exact IDs are now accepted server-side, so a deliberate local trial may set
SOCLAAS_CHAT_MODEL=gemma4:26b in .env (or override .env.local), then restart the dev
process to ensure it uses the new configuration. Existing process environment
wins over files; .env.local wins over .env. No automatic model fallback. Runtime
allowlist no longer silently blocks the discovered Gemma ID. Secret files remain
ignored/uncommitted. Old application prompt is unchanged.

Remaining limitations: single paired observation/case/model, fixed ordering,
empty history, only filter/export fixtures, no live authenticated browser/storage
journey, no general quality/latency claim. Real SoC writing remains experimental;
manual review and explicit publication are required. Further live investigation
requires a new bounded budget. No deployment or Developer AI work.

## Final reviews and state

Independent final code/evidence and security reviews approved without findings.
Code approval covers central model selection and supplied deterministic evidence;
evidence reviewers did not reproduce provider calls or independently re-evaluate
all original generated wording. Security confirmed exact pretransport allowlist,
unchanged trust/resource controls and accurate mixed-outcome reporting. Main
safe check confirmed effective_model=qwen3.5:9b and byte-identical prompt text
against2febb62; no env-file values besides the public model ID were printed.

Five reviewer dispatches: security preflight, exact harness inspection, initial
source/code review, final code/evidence review, final security review. Temporary
discovery/comparison scripts removed after reviews. Referenced files exist and
git diff --check passed. All earlier uncommitted verification work preserved.
No secrets staged/committed; no commit or push requested/performed. Total tool
calls/coding-agent tokens/cache and wall-clock session time not measured.
