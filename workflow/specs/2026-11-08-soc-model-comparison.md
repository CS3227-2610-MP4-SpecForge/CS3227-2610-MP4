# Qwen/Gemma model comparison — approved 2026-11-08

User authorizes changing the model in .env and comparing Qwen/Gemma. Preserve
all prior uncommitted evidence docs. Keep the old committed application prompt.

One bounded authenticated /models discovery found qwen3.5:9b (65,536 context)
and gemma4:26b (131,072 context). Compare these exact deployed models, not model
families generally; sizes differ. Existing 48KB message and 2,000-output policy
fits both reported contexts, but provider-wide limits remain unknown.

At most ten synthetic generation dispatches: five fixed cases paired Qwen/Gemma,
serial, no retries, each <=2,000 output tokens and60seconds. One discovery read
is separate from generation budget. Same rough draft, unknowns, clarification,
clarity and acceptance fixtures from preceding verification, same prompt/user
message/history/JSON mode/reasoning_effort:none/caps. Only model ID varies. Use
actual provider and section constraint; allowlisted shape/failure metadata and
canonical validated synthetic outputs only, no credentials/raw envelopes/reasoning
or real tickets printed/stored. No user/task/database writes during live checks.

Semantic rubric: clear draft retains draft/published filter, reload, All-reset,
permissions/visibility without inventing storage/lifetime/UI policy. Unknowns
keeps CSV/visible requests and both column/filter choices explicitly undecided.
Clarification asks format options only, proposal:null. Clarity preserves every
requirement incl All-reset/permissions/cross-device exclusion and adds no behavior.
Acceptance criteria cover supplied behavior without invention; exact original
title/description prefix preserved by merge (no existing criteria in fixture).
Classify normalization and semantics separately. Five observations/model, fixed
Qwen-first order, empty history are limited evidence, not reliability/latency proof.

After compatible Gemma results, enable only the exact discovered/tested Gemma ID
alongside Qwen. Keep model selection server-only, reject unsupported IDs before
transport. Main-agent TDD/codebase-design at approved provider/HTTP seams; moving
existing runtime allowlist into provider validation is permitted to test the actual
model contract without exposing Next internals. No arbitrary dynamic models, new
client fields, model-specific parser/cap relaxation, fallback or automatic retry.

Set effective local model using evidence: prefer Gemma if clearly more faithful;
retain Qwen if unsupported or mixed. Edit only intended SOCLAAS_CHAT_MODEL line,
preserve all other secret-file bytes, write atomically0600 and account for
.env.local/process precedence. Never print secret contents or commit env files.
Record final public model ID and rationale. Existing auth/privacy/stale-edit/
publication controls remain. No deployment/Developer AI/provisioning/commit/push.
Security preflight and exact harness check, then independent code/security reviews,
relevant deterministic checks, updated guide and one sanitized session log.
