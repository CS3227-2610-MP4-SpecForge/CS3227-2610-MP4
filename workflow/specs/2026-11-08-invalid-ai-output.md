# Debug invalid AI output — 2026-11-08

Authorized by the user's report that Draft ticket fails with invalid_output and
explicit request to debug it. Preserve all existing uncommitted implementation.
Use the previously approved provider, authenticated HTTP/local RPC and browser
seams; no new ticket/editor behaviour is requested.

Establish a reproducible cause using at most two synthetic SoC checks, each with
2,000 output tokens and a 60-second deadline, no retries or real task data. Output
only allowlisted status/shape/length metadata; do not print/store raw responses,
hidden reasoning or credentials. Historical discarded responses cannot be recovered
or retrospectively diagnosed. Apply compatibility changes only with evidence.

Persist a fixed invalid-output reason with failed private turns: truncated,
invalid_json, invalid_schema, invalid_envelope, missing_content, tool_calls,
unexpected_finish, body_limit or unsafe_section. No parse exception text, provider
fields, Zod paths or arbitrary keys. Enforce code/source/reason binding in both
TypeScript and PostgreSQL; accept historical invalid_output rows with null
metadata. Retries clear metadata. Show specific actionable failures on reload.

Keep existing authorization, strict complete-proposal validation, 2,000-token
budget, 60/75-second waits, 64KiB transport cap and existing context/storage/rate caps, no automatic
provider retries/fallback, text-only rendering and explicit publication.
Main agent implements with TDD and codebase-design; independent code/security
reviews. Regression tests cover provider classifications, RPC metadata rejection,
legacy rows, private reloads and browser rendering. No new secrets/content logging.


## Reproduction and compatibility fix

Two bounded synthetic checks completed. Baseline: HTTP200, finish_reason=stop,
invalid content JSON, 45,863ms. Same request with response_format=json_object:
HTTP200/stop, valid nonempty reply and proposal=null, 2,389ms. No reasoning text
was printed or retained. The baseline reproduces a current failure, not proof of
the historical user's exact cause. Enable explicit JSON mode without changing
limits or adding retries. JSON mode still requires strict reply/proposal checks.
Also accept empty provider tool-call lists; reject actual/non-array tool calls.

Reference: official [Ollama compatibility documentation](https://docs.ollama.com/api/openai-compatibility)
lists response_format support; actual SoC acceptance was established by the
synthetic check rather than assuming backend configuration from the model name.
