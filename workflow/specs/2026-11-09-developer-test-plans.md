# Developer AI: generated test plans

Status: specification for implementation on `feat/developer-test-plans`.

## Problem and user

A Developer opens a published ticket and must work out how to verify it. The
ticket states desired behaviour and acceptance criteria in prose; turning that
into concrete cases is repetitive, and the cases a developer forgets are usually
the edge and failure ones. The Product Manager has an AI feature; the Developer
role has none.

## Behaviour

1. A Developer viewing a **published** ticket in an organisation they belong to
   sees a Test plan section in the ticket's right panel. Product Managers see the
   same section but cannot generate; they see only a saved plan, read-only.
2. The Developer presses Generate. The server sends the ticket title and
   description to SoC LLM and expects a strict JSON envelope: a short human reply
   plus a proposed plan of between 1 and 12 cases. Each case has a title, a
   kind (`happy`, `edge` or `failure`), optional preconditions, 1 to 10 ordered
   steps and an expected result.
3. The generated plan appears as a **proposal**, not as saved content. The
   Developer reads it and either saves it to the ticket or discards it. Nothing
   is written to the ticket until they save.
4. A saved plan is visible to every member of the organisation, with the username
   of the developer who saved it and the ticket revision it was generated
   against. Saving again replaces it and bumps a plan revision.
5. If the ticket content has changed since a plan was generated, the proposal is
   stale: saving it is refused rather than silently applied over newer wording,
   matching how PM suggestions already behave.
6. A free-text focus note (optional, up to 500 characters) lets the Developer ask
   for emphasis, for example "concentrate on the invitation expiry rules". It is
   stored with the turn so a retry keeps the same instruction.

## Permissions

- Generate: organisation member, email verified, `app_role = 'Developer'`, ticket
  published (`submitted_at is not null`) and in that organisation. Any developer
  member may generate, not only assignees: a reviewer needs it too.
- Read own turns: the generating developer only, like the PM's private chat.
- Read saved plan: any member of the organisation.
- Save: the same conditions as Generate.
- Admit and complete turns: `service_role` only. A browser session cannot forge a
  completion, release a lease or reset usage.

## Failures and limits

- Reuse the existing bounded SoC transport: one deadline, no automatic transport
  retry, 64 KiB response cap, allowlisted failure codes and diagnostics, strict
  envelope checks. Failure diagnostics reuse `private.valid_ai_diagnostic`.
- Caps: 20 generations per developer per hour, one running turn per developer,
  idempotent turn keys, 120-second leases with generation fencing, and a stored
  size cap per ticket, all mirroring `chat_turns`.
- A plan that fails schema validation is an `invalid_output` failure; the ticket
  and any saved plan are untouched.
- Model output is untrusted: cases are rendered as text, never as Markdown or
  HTML, so a case cannot inject formatting or links into the ticket view.
- The ticket content sent to the model is untrusted reference material, stated as
  such in the system instructions and passed as a separate JSON payload rather
  than interpolated into the instruction text.

## Design

- `private.valid_test_plan(jsonb)` is the single storage-side definition of a
  valid plan; `src/test-plans.ts` holds the same caps once for client and server.
- `soc.ts` is refactored so the bounded request, envelope checks and failure
  mapping live in one place and each feature supplies only its instructions and
  its validator. The PM chat provider keeps its current behaviour exactly.
- `public.test_plan_turns` mirrors `chat_turns`. `public.ticket_test_plans` holds
  one saved plan per ticket.
- Routes: `GET`/`POST /api/organisations/:org/requests/:id/test-plan` for turns,
  `PUT` on the same path to save a reviewed plan.

## Out of scope

- Generating runnable test code. Cases are language-agnostic text.
- Linking cases to real test runs, coverage or CI results.
- Editing individual generated cases before saving; it is save-all or discard.
- Any change to PM chat behaviour or to the ticket content schema.

## Test boundaries

- Unit, deterministic transport: envelope and schema validation, cap enforcement,
  instruction/content separation, failure and diagnostic mapping.
- Local database: role gating (a PM cannot generate, a non-member cannot read), a
  draft ticket is refused, worker-only admission and completion, stale-plan
  save conflict, admission and capacity limits.
- Browser: a developer generates with the local fake provider, reviews, saves,
  and a second account sees the saved plan. **Not written yet**: the local fake
  provider (`localFakeTestPlanAi`) is in place for it, but no Playwright spec
  covers the panel, so the UI has had no executed check.
