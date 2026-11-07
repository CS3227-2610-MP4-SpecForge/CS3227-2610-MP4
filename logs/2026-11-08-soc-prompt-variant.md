# Short action-specific prompt comparison — 2026-11-08

Human verification: pending. Production revision remains 2febb62. User requested
“Proceed with testing the new prompt variant” after the preceding live run. Main
agent stated a fresh ceiling of ten calls and kept production prompt unchanged.
Approved experiment/synthetic rubric and exact candidate text are in
workflow/specs/2026-11-08-soc-prompt-variant.md.

## Experiment

Five fixed synthetic cases paired baseline then candidate: clear draft, unknowns
draft, clarification, clarity, acceptance. Same fixtures as preceding run, same
user messages/history/model/JSON mode. All history empty. Candidate was a short
common instruction plus one task-specific instruction selected from the fixed
case; only system message changed in a temporary harness. No action classification
or prompt-routing module was implemented in application source.

Ten preplanned serial dispatches maximum; 2,000 output tokens, 60-second deadline,
48,000-byte message cap checked again after substitution, 64KiB response cap,
original adapter signal/redirect/cache/envelope/tool/schema checks retained. Actual
createSocProvider and acceptance constraint used for both arms. No retries,
mid-run prompt tuning, model/config changes or production adoption. Candidate
retains untrusted-data, suggestion-only authority, explicit unknowns and JSON rules.

Observer captured only bounded known-field types/lengths/extra-key counts and
allowlisted HTTP/finish/failure metadata. Only canonical validated synthetic
replies/proposals were inspected. No raw envelopes, hidden reasoning, credentials
or real ticket content printed or stored. No real task/chat mutation. Exact
static candidate is recorded in spec; generated output is summarized below.

This is an exploratory one-observation-per-case/arm comparison, not a controlled
reliability/latency benchmark. Baseline always ran first, so order/provider load
could affect outcomes. Empty history and a single filter/export fixture family
limit generalization. Semantic fidelity is assessed manually against predeclared
facts, separately from parsing and section preservation.

## Measured results

Exactly ten dispatches, no retries or timeouts. Each arm yielded four accepted
outputs (three proposals/one clarification) and one rejected output. All ten HTTP
responses were200; nine reported stop. Baseline clear draft used a non-allowlisted
finish value, recorded only as other; adapter rejected unexpected_finish. This
is not evidence of an app schema defect. No live malformed response content was
inspected or reconstructed.

| Call | Case / arm | ms | Message bytes | Format result | Semantic assessment |
| --- | --- | ---: | ---: | --- | --- |
| 1 | Clear / baseline | 9,482 | 2,830 | invalid_output/unexpected_finish; content_json=false | No usable output to assess. |
| 2 | Clear / candidate | 8,152 | 1,458 | Complete normalized proposal; three extra proposal keys stripped | Retained All/reload/permissions, but invented cookies/local-storage choice, session lifetime, dropdown/default-view and security details. Fails no-invention rubric. |
| 3 | Unknowns / baseline | 6,960 | 2,785 | Complete normalized proposal | Both material choices left open; added unrelated out-of-scope material and button choice. Core unknowns requirement met with extra scope noise. |
| 4 | Unknowns / candidate | 3,688 | 1,413 | Complete normalized proposal | Concise CSV/visible-requests draft explicitly leaves both columns/filter coverage undecided. Useful observation; used bold labels rather than requested ATX headings. |
| 5 | Clarification / baseline | 2,216 | 2,662 | Human reply; proposal=null | Format options; additionally asked for unspecified platform requirements. |
| 6 | Clarification / candidate | 2,738 | 1,138 | Human reply; proposal=null | Only requested format question with readable options. Meets rubric in this observation. |
| 7 | Clarity / baseline | 3,026 | 2,835 | Complete normalized proposal; one extra proposal key stripped | Omitted All-reset and permission-preservation requirements; not faithful. |
| 8 | Clarity / candidate | 5,330 | 1,363 | Complete normalized proposal | Omitted All-reset; introduced same-session/window wording. Not faithful despite preserving permissions/exclusion. |
| 9 | Acceptance / baseline | 3,811 | 2,866 | Complete proposal and successful real section merge | Exact original title/prefix preserved, but new criteria invented navigation/incognito/cache behavior and omitted All/permission coverage. Not useful criteria. |
| 10 | Acceptance / candidate | 24,207 | 1,431 | invalid_output/invalid_schema | Known title string, missing description, eight extra root/two extra proposal keys. Correct rejection; no section merge or semantic inspection. |

No neutral-reply fallback was observed. No context/body cap was reached. Candidate
message sizes were lower on these exact fixtures; no latency or token-use saving
claim follows from this small fixed-order sample. Actual completion-token counts
and provider internal processing times were not collected.

## Decision and limitations

Do not adopt this candidate. It produced more focused unknowns/clarification in
these observations but did not fix omission or invented requirements, and failed
to supply a complete acceptance proposal. Both arms had the same number of usable
structured outputs; there is no demonstrated overall advantage. Format success
is not semantic success. The application remains on committed prompt2febb62.

The candidate was deliberately fixed before calls, not tuned to each output.
Further calls would need a separately bounded authorization. Before another
prompt-only iteration, investigate how to assess the configured SoC model's
instruction-following capability or evaluate a SoC-supported alternative; no
model discovery/switch was performed here. A prompt experiment is not evidence
that provider/model internals caused these defects.

No application edits or new deterministic tests. Historical checks remain separate:
68 deterministic tests,39 local DB tests and lint/typecheck/build passed during
preceding implementation;16 browser journeys passed earlier. This run exercised
provider+section constraint, not authenticated HTTP/storage/browser behavior.

## Reviews and checks

Security preflight requirements and concrete pre-dispatch harness inspection
approved without blocking findings. Inspector verified exact candidate, fixed
paired fixtures, system-only replacement, context recheck, forwarded limits/signal,
bounded metadata, ten-call budget and no production adoption. No reviewer live
calls, credential access or edits. node --check on temporary harness passed before
dispatch. Evidence/source/spec references and git diff --check verified separately.
Final independent evidence/security conclusions recorded below after review.

Live calls10; automatic retries0; no live quota beyond this cap. Provider-wide
quotas, coding-agent tokens/cache, total tool calls and total elapsed session time
unavailable. No commit, push, setup restart, provisioning or deployment. Previous
uncommitted verification documentation preserved.

Final independent code/evidence and security reviews approved without findings.
They verified harness methodology, recorded candidate and evidence consistency;
neither reproduced live calls or independently reassessed original generated text.
Four reviewer dispatches: security preflight, concrete pre-dispatch inspection,
security evidence review, code/evidence review. Experiment references exist;
final git diff --check passed. Temporary harness removed after reviews. Only
verification documentation/spec/log changes remain uncommitted; preceding
verification work remains preserved.
