# Committed SoC writing verification — approved 2026-11-08

User authorized up to ten new synthetic calls after commit 2febb62. Verify that
committed tolerant normalization accepts useful outputs without conflating JSON
compatibility and semantic quality. No source/prompt changes planned.

Use five fixed synthetic cases twice: clear rough idea, material unknowns,
human-only clarification, Improve clarity, Add acceptance criteria. Repetitions
are independent preplanned observations, not automatic retries. Each actual
createSocProvider call retains 2,000 output tokens, 60-second deadline, existing
context/body caps and no automatic retry. Ten total attempted dispatches maximum.

Inspect only validated synthetic reply/proposal and allowlisted structural/failure
metadata; no credentials, raw envelopes, hidden reasoning or real tickets printed
or persisted. Temporary bounded transport observation may record known-field
types/lengths and counts of discarded fields; never field values from failed
responses. Assess required details retained, invented requirements, consistent
unknowns and human-only behavior separately from successful normalization.
Acceptance results additionally pass through the existing section constraint and
must preserve the title and unrelated original bytes. This provider/constraint
check is not authenticated HTTP/storage/browser end-to-end evidence.

Read-only security preflight and evidence review. No new tests/seams, source
changes, parser relaxation, model discovery, deployment, commit or push. Update
guide/session evidence; deterministic regression evidence remains separately dated.
