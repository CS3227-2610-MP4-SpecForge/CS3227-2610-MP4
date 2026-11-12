# Reflections: agent draft for the author to rewrite

**This is not final text.** Reflections are graded personal work. An agent
drafted these sections from the logs, specs and tests (workstream G of
[the MP3 feedback spec](../specs/2026-11-12-mp3-feedback-improvements.md)) so the
author has the evidence in one place. Rewrite each section in your own voice,
keep or drop claims as you judge, then move the result into
[docs/Reflections.md](../../docs/Reflections.md) and delete this file. Every claim
below cites a log, spec or test that exists; check each before keeping it.

Notes for the author:

- Some things you may want to discuss are not recorded anywhere, so this draft
  does not claim them. Examples: running workstreams A, B and D in separate
  sessions with their own worktrees, and how you decided what to delegate. Add
  them from your own experience.
- Words like "cost" and "saved" are avoided below because no token or time
  savings were measured. Keep it that way unless you have numbers.

## AI security across both features

Both AI features treat ticket text as untrusted input to the model and treat the
model's output as untrusted input to the app.

- **Instructions and data are kept apart.** The test plan request sends its
  fixed instructions separately from the ticket and the developer's focus note,
  and a ticket titled "Ignore previous instructions" never reaches the
  instruction text
  ([`test-plans.test.ts`](../../src/tests/test-plans.test.ts), "sends the
  instructions separately from untrusted ticket content and the focus note").
  The PM assistant does the same; its outbound prompt contract is tested in the
  [writing stabilisation log](../../logs/2026-11-08-soc-writing-stabilization.md).
- **Output is validated, then rendered as text.** Replies that do not fit the
  schema fail as `invalid_schema` and are never repaired
  ([tolerant response spec](../specs/2026-11-08-tolerant-ai-response.md),
  [`soc.test.ts`](../../src/tests/soc.test.ts)). A ticket containing a `<script>`
  tag, a tracking image and a `javascript:` link renders without running or
  fetching any of them ([`requests.spec.ts`](../../src/tests/browser/requests.spec.ts),
  the first journey's `requestInjected` check).
- **Authority stays in the database.** A forged completion is denied, late
  output after a member is removed is not stored, and a PM's chat stays private
  even from an organisation admin
  ([`chat.database.test.ts`](../../src/tests/chat.database.test.ts)). Test plan
  generations are private to their developer, and the HTTP layer authorizes
  before the provider is reached
  ([`test-plans.database.test.ts`](../../src/tests/test-plans.database.test.ts)).
- **Spend is bounded.** Hourly request and attempt limits are persistent, and a
  failed turn is refunded once while attempts are never refunded
  ([`chat.database.test.ts`](../../src/tests/chat.database.test.ts), "enforces a
  persistent account limit").
- **Diagnostics leak nothing.** Failure details are an allowlist: no raw
  provider text, parse errors or hidden reasoning is stored
  ([diagnostics spec](../specs/2026-11-07-ai-failure-diagnostics.md),
  [`chat.database.test.ts`](../../src/tests/chat.database.test.ts)), and server
  failure logs carry only fixed fields
  ([log](../../logs/2026-11-12-server-failure-logging.md)).

## Security of the development agents

- **Review is enforced, not requested.** Test runs showed the independent
  reviewer was skipped in 4 of 5 runs while it was only a written brief. It is
  now a registered read-only subagent, and a hook denies `git commit` until the
  exact `src/` diff is approved
  ([review gate log](../../logs/2026-11-12-review-gate.md)). The log notes the
  gate was tested in a scratch repository, and that other agent clients do not
  run these hooks.
- **Credentials are redacted from tool output.** During the first deployment, a
  failed `supabase db push` printed nothing because output was suppressed. The
  fix relays the tail of the output with JWTs, keys and passwords redacted, and
  the redaction was checked against sample lines before relying on it
  ([first deployment log](../../logs/2026-11-10-first-live-deployment.md)).
  Earlier, a local CLI diagnostic printed disposable local credentials once,
  which is why the wrappers suppress credential-bearing output
  ([Reflections](../../docs/Reflections.md), "First implementation slice").
- **Secrets stayed out of the transcript.** When the agent drove the browser
  during deployment setup, account creation, passwords and tokens stayed with
  the user ([first deployment log](../../logs/2026-11-10-first-live-deployment.md)).
- **Tool output is data, not instructions.** The project's security skill tells
  both the implementer and the security reviewer to treat user, retrieved and
  generated text as untrusted
  ([`specforge-security`](../../.agents/skills/specforge-security/SKILL.md)). No
  incident is recorded in a log, so this is a stated rule, not observed
  evidence. Add an example if you saw one.

## What validation cannot guarantee

Validation catches malformed output. It cannot catch a well-formed proposal that
is wrong.

- In the committed live check, one acceptance-criteria result passed every
  check but invented session and cache behaviour and omitted a reset
  requirement the ticket stated
  ([live verification log](../../logs/2026-11-08-soc-live-verification.md)).
- Comparing Qwen and Gemma on the same cases found no overall winner: on the
  acceptance case Qwen refused without a proposal, while Gemma's valid output
  invented a criterion and omitted a stated one
  ([model comparison log](../../logs/2026-11-08-soc-model-comparison.md)). A
  shorter prompt still produced drafts that invented storage and session choices
  ([prompt variant log](../../logs/2026-11-08-soc-prompt-variant.md)).
- That is why AI never publishes, every change goes through a per-change review,
  and a first draft has an undo
  ([review spec](../specs/2026-11-11-ai-chat-review-modal.md)). Test plans are
  saved only by a developer's explicit decision
  ([test plan spec](../specs/2026-11-09-developer-test-plans.md)).
- Passing local tests use a fake provider, so they say nothing about live
  quality ([Developer Guide](../../docs/DeveloperGuide.md#observed-provider-behaviour)).

## Multi-agent work, context engineering and resource-aware use

- **Independent reviewers found what tests did not.** In the route split, a
  differential test of 1,800 requests matched old and new routing exactly, yet the
  reviewer found one path the test never tried, which returned an organisation
  through a fixed-length slice
  ([formatter and routes log](../../logs/2026-11-12-formatter-and-routes.md)).
  In the guides, review found three factual errors in a new endpoint table and
  diagram ([usable guides log](../../logs/2026-11-12-usable-guides.md)). Earlier,
  review found unsaved-work and whitespace bugs that a passing browser journey
  missed ([Reflections](../../docs/Reflections.md), "Manual request lifecycle").
- **Reviewers get context, not conversation.** Each reviewer receives the spec
  path, the exact diff, the relevant files and test evidence, and stays
  read-only ([workflow README](../README.md), "Coordination and resource
  limits"). Unfinished work moves through one short handoff note rather than a
  transcript (same README, "Resuming unfinished work").
- **Instructions were cut down to what lasts.** `AGENTS.md` lost its feature
  inventory and test history in favour of durable constraints and pointers
  ([log](../../logs/2026-11-10-agent-instructions-cleanup.md)), and session logs
  were made outcome-focused
  ([log](../../logs/2026-11-10-concise-session-logs.md)).
- **Provider quota is spent deliberately.** Routine tests use a fake AI, CI
  never calls SoC, and the one live suite is opt-in and makes exactly two calls
  ([live runs log](../../logs/2026-11-10-soc-llm-live.md)).
- **Parallelism was measured, not assumed.** Running the browser suite on two or
  four workers failed consistently at sign-in, because the app's own
  auth-attempt limit is shared, so the suite stays on one worker
  ([browser stability log](../../logs/2026-11-12-browser-suite-stability.md)).
