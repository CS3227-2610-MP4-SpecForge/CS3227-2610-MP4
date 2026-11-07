# Shared architecture policy

Current decision: one deployable app with feature-oriented modules. Stack,
schema, product entities and exact interfaces will be agreed with the product
specification before scaffolding; this file does not invent their implementations.

- Keep PM and Developer features distinct, sharing authentication, project
  authorization, persistence and SoC LLM access instead of reimplementing them.
- Enforce identity and project authorization on the server; UI visibility is not enforcement.
- Keep provider credentials and calls on the server. Centralize provider errors,
  bounded retries and rate/concurrency limits behind a small interface.
- Isolate external dependencies to allow deterministic tests without live LLM calls.
- Put code that changes together together; prefer useful interfaces over layers
  that only delegate. Add abstractions when actual variation warrants them.
- Test public behavior and integration boundaries. Do not expose internals only for tests.
- Review boundary changes when they happen; record a significant trade-off here
  or in a short ADR only when future maintainers need the reason.

Source code belongs under `src/`. No test commands exist until a stack is selected.
