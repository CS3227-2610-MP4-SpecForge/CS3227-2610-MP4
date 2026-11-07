# Minimal SoC instruction-following diagnostic — 2026-11-08

Human verification: pending. User approved the minimal next diagnostic. Scope and
exact fixed system/input/rubric saved before dispatch in
workflow/specs/2026-11-08-soc-minimal-diagnostic.md. Preserve all preceding
uncommitted model-allowlist/source/test/evidence work; no implementation changes
planned. Qwen remains the effective local default, old production prompt retained.

## Documentation check

Public primary sources checked on2026-11-08:

- https://soclaas.comp.nus.edu.sg/guides/api.html confirms the compatible base URL,
  chat endpoint and model discovery, with model-dependent capabilities. It does
  not describe JSON-mode or reasoning_effort semantics for these deployments.
- The linked detailed DocHub page https://dochub.comp.nus.edu.sg/cf/guides/soclaas/start
  could not be fetched by the web tool (502). This is an access/fetch limitation,
  not proof the documentation/service itself is unavailable to the user.
- https://docs.ollama.com/api/openai-compatibility lists JSON mode/response_format
  and reasoning_effort. Thinking values/handling depend on model metadata; this
  does not verify SoC's serving implementation or deployed version.

Prior actual SoC responses accepted the current settings on several calls, but
HTTP200 alone does not prove every parameter is honored. No basis established
to label reasoning_effort:none unsupported or identify it as a failure cause.
No parameter change or extra live discovery request was made for this check.

## Method

Exactly two planned serial generation attempts, Qwen then Gemma, through actual
createSocProvider with unchanged endpoint, JSON-object mode, reasoning_effort:none,
model allowlist, max_tokens2000,60-second deadline,48KB context/64KiB body caps.
Only system text replaced temporarily; message bytes rechecked after substitution.
Same tiny title/description/message and empty history for both. Three requirements:
draft/published filtering, All clears the filter, existing permissions unchanged.
Ask to reword only, retain exact title/all facts and add nothing. Full exact input
and short system instruction are in the approved experiment spec.

Bounded pass-through observer records allowlisted types/lengths/counts/status/finish
or safe failure diagnostics. Only canonical validated synthetic reply/proposal
content inspected. No credentials, raw envelopes, hidden reasoning, provider
error text or real ticket content printed/stored. No user task/chat writes,
parameter tuning/retries, app/env changes, deployment, commit or push.

Assess proposal completeness and exact title separately from manual semantic
rubric: retain allthree facts, add no requirements/assumptions/policy/implementation
or questions. A transport/schema failure has no usable semantic output. One
observation/model, fixed order and tiny empty-history task cannot establish
reliability, general model capability or the cause of earlier app-prompt failures.

## Actual results

Exactly two generation dispatches completed; zero retries/timeouts. Both returned
HTTP200/stop, valid complete canonical proposals, unchanged title, no extra keys,
no neutral fallback. Actual serialized message bytes811 for both, unchanged
2000-output limit (actual completion token use not collected).

| Model | App-observed ms | Response bytes | Schema/title | Semantic assessment |
| --- | ---: | ---: | --- | --- |
| qwen3.5:9b | 2,109 | 573 | Complete proposal; title exactly preserved | Retained draft/published filtering and unchanged permissions. Replaced named All control with generic filter clearing/reset wording; failed explicit All-preservation criterion. |
| gemma4:26b | 3,233 | 670 | Complete proposal; title exactly preserved | Retained draft/published filtering, explicit All option clearing the filter, and unchanged permissions. No added behavior/implementation/questions observed. Passed this tiny-case rubric. |

Qwen's result does not demonstrate a universal inability to preserve requirements;
Gemma's single pass does not demonstrate reliable behavior on full tickets.
Combined with prior mixed full-prompt results, the minimal Gemma result makes it
a candidate for a narrowly scoped clarity follow-up, not a justified automatic
application-wide model/prompt switch. Qwen's explicit-control omission persists
in this minimal observation; it cannot be attributed solely to the long product
prompt. No serving/model-internal root cause established.

Both models accepted requests containing JSON mode and reasoning_effort:none;
this does not prove the latter was honored. Parameters were not varied, so no
causal conclusion about reasoning_effort follows. No app/env/model/prompt change
or further live call. A broader Gemma-only/action-specific comparison would be
new work with a separately bounded budget and existing preservation controls.

## Verification and reviews

Security preflight and concrete pre-dispatch inspection approved without findings.
Temporary harness syntax check passed. Existing application changes and earlier
verification documentation preserved. No source changes/new routine tests in this
diagnostic. Previous74deterministic/40localDB/lint/typecheck/build results remain
historical, not repeated or counted as live evidence. No browser/authenticated
HTTP/storage end-to-end claim for these direct provider calls.

Resource evidence:2livegenerationcalls,0retries. Public docs fetched separately;
no additional authenticated model discovery/provider probe. Provider internal
processing/quota/token-use figures, total wall time/tool counts and coding-agent
tokens/cache unavailable. Final evidence reviews and diff checks recorded below.

Final independent code/evidence and security reviews approved without findings.
They checked experiment/claims consistency against inspected harness, not provider
replay or independent re-evaluation of every output. Four reviewer dispatches:
security preflight, exact pre-dispatch inspection, code/evidence review and final
security review. Syntax/reference checks and git diff --check passed. Temporary
harness removed after review. Existing source/test changes from model support
remain unchanged; only diagnostic spec/log/guide evidence added by this task.
