# Live verification of committed AI response handling — 2026-11-08

Human verification: pending. Revision tested: 2febb62, clean at start. User newly
authorized up to ten synthetic SoC calls after the earlier budget was exhausted.
Approved scope: workflow/specs/2026-11-08-soc-live-verification.md. No source,
prompt, model or configuration changes during this verification.

## Method and limits

Five synthetic cases repeated in two fixed rounds: clear draft, draft with
material unknowns, clarification without edits, Improve clarity, Add acceptance
criteria. Repetitions were preplanned independent observations, not automatic
retries. Calls ran serially through committed createSocProvider with the actual
configured qwen3.5:9b, JSON mode, 2,000 maximum output tokens, 60-second deadline,
48,000-byte context and 64KiB response caps. Redirect/cache/error behavior unchanged.

Temporary external harness passed actual transport init/signal to fetch and
forwarded original bytes/errors through a bounded pass-through observer. It
collected only fixed known-field types/lengths, unknown-key counts and allowlisted
status/finish/failure metadata. No credentials, raw provider envelopes, hidden
reasoning or real tickets were printed/stored. Only canonical validated synthetic
reply/proposal content was inspected for meaning; this log contains summaries.
No provider error payloads or arbitrary schema paths were retained.

Synthetic clear/clarity/acceptance fixtures required remembering draft/published
filters on same-browser reload, All clearing the filter, unchanged permissions,
and (for existing tickets) no cross-device synchronization. Unknowns fixture
required CSV export with columns/filter scope left undecided. Clarification asked
for export-format options before drafting. Acceptance outputs passed the real
constrainSuggestion action and were checked for exact title/original-prefix
preservation (fixture had no existing criteria section).

This checks live provider/section-constraint behavior, not authenticated HTTP,
Supabase persistence, browser application, stale-edit protection or publication.
Those controls have separate deterministic evidence at the tested commit: 68
unit/HTTP checks, 39 local DB tests, lint/typecheck/build passed in the preceding
implementation; 16 earlier browser journeys passed before the tolerant-contract
change. None were repeated or reclassified as live evidence in this docs-only task.

## Actual live outcomes

Exactly ten attempted dispatches completed; zero automatic retries. Seven were
normalized successfully (five complete proposals and two human-only replies),
two reached the local deadline, and one was rejected for invalid known fields.
These are counts for this fixed small sample, not a general reliability rate.
All eight received HTTP responses were 200/stop. Timeout calls did not yield an
HTTP response before the deadline. No body/context cap was reached.

| Call | Round / case | App-observed ms | Format/constraint result | Writing assessment |
| --- | --- | ---: | --- | --- |
| 1 | 1 / clear draft | 9,564 | Complete normalized proposal | Invented session restrictions/technical questions; described All as showing none, then later as clearing the filter. Not faithful. |
| 2 | 1 / material unknowns | 9,062 | Complete normalized proposal | Columns and filter handling explicitly left undecided, with readable questions. Core uncertainty requirement met; extra generic out-of-scope wording still warrants review. |
| 3 | 1 / clarification | 2,965 | Human reply; proposal=null | Offered format options without editing; also asked about column customization beyond the requested format question. |
| 4 | 1 / clarity | 8,295 | Complete reviewable proposal | Omitted All-reset requirement, invented tab/cache behavior and extra migration/storage questions. Not scope-preserving. |
| 5 | 1 / acceptance | 4,409 | Complete proposal; real merge preserved exact original title and all original description bytes | Added unsupported same-session/no-restart and technical-support cache-reset criteria; omitted All-reset criterion. Preservation succeeded, useful criteria did not. |
| 6 | 2 / clear draft | 60,009 | local_timeout; local_deadline diagnostic elapsed_ms 60,009 | No returned content; no semantic assessment. |
| 7 | 2 / material unknowns | 60,006 | local_timeout; local_deadline diagnostic elapsed_ms 60,005 | No returned content; no semantic assessment. |
| 8 | 2 / clarification | 5,200 | Human reply; proposal=null | Offered format options before drafting; additionally asked which columns. |
| 9 | 2 / clarity | 6,329 | Complete proposal with two extra proposal keys stripped | Live normalization benefit observed. Still omitted All-reset and added same-session/filter-tab wording; not a faithful clarity-only edit. |
| 10 | 2 / acceptance | 2,490 | invalid_output/invalid_schema, title=null and empty description | Correct rejection of unusable known fields, not harmless formatting. Section merge was not reached. |

No response had extra root keys; only call 9 had extra proposal keys. Every
received response had a string reply, so neutral reply fallback was not exercised.
Call 9 establishes actual acceptance of a complete proposal with harmless extra
fields; it does not establish improvement in writing quality or reconstruct any
earlier discarded schema failure. Call 10 should remain rejected under the
approved complete-ticket contract. No parser relaxation is indicated by that case.

Two drafting calls, two unknowns calls, two clarification calls, two clarity calls
and two acceptance calls were preplanned. The second round did not retry failed
turns or alter prompts. Complete proposals were inspected before any real ticket
application: no user request, chat history or publication was mutated.

## Findings and next direction

- JSON compatibility and usable writing are separate. Relaxed normalization worked
  on one actual extra-field output, and strict rejection protected against a null
  title/empty description. No missing-reply/fallback evidence was obtained live.
- Clarification-only output is observed twice. Explicit unknowns are observed in
  one useful draft, but this sample cannot establish consistent unknown handling.
- Acceptance merging is observed preserving title/unrelated bytes on one live
  output; the inserted criteria were semantically poor. Preserving old sections
  does not make the new section correct.
- Scope invention and omission remain the dominant writing defects. Consider a
  separately approved prompt experiment with concise action-specific instructions;
  keep the canonical contract and current editing controls. Do not claim model
  quality is stabilized or spend further live quota under this exhausted budget.

## Checks, reviews and resource use

Security preflight approved constraints before dispatch. Independent read-only
security inspection of the temporary harness found no blocking instrumentation
concern: same adapter signal/caps, bounded capture, original bytes/errors passed
through, metadata allowlist and canonical synthetic output only. Reviewers made
no calls, accessed no credentials and edited no files.

This is a docs/evidence task: no implementation change or artificial new routine
test. Prior deterministic results above remain historical and separately labeled.
Guide/spec/log updated. Final diff checks and evidence reviews recorded below.
Measured provider attempts:10; automatic retries:0. Provider token usage, provider
internal timing/quotas, coding-agent token/cache use and total wall time were not
collected. No commit, push, setup restart, data reset or deployment.

Final independent code/evidence and security reviews approved without findings.
Reviews checked harness/committed handling/evidence consistency; neither repeated
calls or independently reconstructed the original synthetic output. Four reviewer
dispatches: security preflight, instrumentation inspection, security evidence
review and code/evidence review. Referenced evidence/source paths exist; git diff
--check passed. Temporary harness removed after reviews. Only DeveloperGuide,
this session log and its approved verification spec remain uncommitted.
