# Shared architecture policy

Current decision: one deployable Next.js/React app with feature-oriented modules
and Supabase Auth/PostgreSQL. Organisations own requests; application roles and
organisation-admin membership are distinct. See the approved product spec and
`docs/DeveloperGuide.md` for implemented interfaces and their test seams.

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

Source, tests, Supabase migrations/config and local tooling belong under `src/`.
Root package/framework configuration is required tooling. Use the documented
checks; future PM/Developer AI modules share one server-side provider adapter.
