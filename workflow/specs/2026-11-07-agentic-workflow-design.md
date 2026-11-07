# SpecForge development workflow design

Status: proposed; awaiting user approval of this document.

## Purpose and scope

Define a small, coordinated development workflow for two students building
SpecForge. Use Superpowers as the baseline and add project-specific security
guidance and evidence collection. This is the development process, not an
in-app multi-agent system or the product requirements specification.

The students own the Product Manager and Developer application features
respectively, and share infrastructure and integration work. Application roles
are distinct from development agent roles. Each student remains responsible for
understanding their changes and reviewing AI-produced evidence.

## Agreed direction

- Follow specification-driven development and TDD.
- Use a shared security skill and an independent security specialist, invoked
  when relevant rather than on every change.
- Keep a coordinator, task implementer, and independent reviewer.
- Build on Superpowers' existing workflows and prompt templates.
- Consolidate development workflow material under `workflow/` and sanitized
  interaction summaries under `logs/`.

## Approaches considered

1. Security skill only: lowest overhead, but lacks a dedicated independent
   security perspective.
2. Security subagent only: explicit specialist ownership, but risks discovering
   security requirements late and duplicating guidance.
3. Shared skill plus selectively invoked security subagent: consistent guidance
   during implementation and independent scrutiny of sensitive changes. The
   user selected this approach.

## Roles and boundaries

| Role | Owns | Output and boundary |
| --- | --- | --- |
| Coordinator | Task decomposition, dependencies, assignment, context, review routing, progress and conflict resolution | Task briefs, decisions, handoffs and completion records; never approves its own implementation as independent review |
| Implementer | One bounded task, including tests and security controls | Code, tests and a report with RED/GREEN evidence; cannot self-approve |
| Independent reviewer | Specification compliance, maintainability and test quality | Evidence-linked findings and approved / needs-fixes verdict; read-only by default |
| Security specialist | Threat analysis and verification of security-sensitive changes | Threat cases before implementation; evidence-linked findings and approved / needs-fixes verdict afterward; read-only by default |

The main chat acts as coordinator. Implementers and reviewers are fresh,
task-scoped subagents, not permanently running processes. A security review is
separate from implementation and from general review. Neither reviewer creates
further subagents. Students approve specifications and merge decisions.

## Proposed execution procedure

1. Agree a feature specification with acceptance criteria and explicit scope.
   Identify authorization boundaries, AI behavior and resource constraints.
2. Coordinator classifies the change and records whether security review is
   required, with a reason. For sensitive work, ask the security specialist for
   threat cases and testable controls before finalizing implementation tasks.
3. Write an implementation plan referencing the approved specification. Assign
   bounded tasks and file ownership. Give each task an isolated workspace where
   possible; otherwise allow only one writer on a shared checkout. Run work in
   parallel only when its dependencies and files permit it.
4. Implementer follows RED -> GREEN -> REFACTOR for each behavior. Confirm the
   test fails for the expected missing behavior, implement the minimum change,
   and refactor with tests green. Apply this to bug fixes and security controls
   as well as normal functionality. Do not count a broken test harness as RED.
5. Implementer runs relevant checks and the project test suite before reporting
   completion. Record failures, including unrelated ones. Bind reports to the
   exact commit or diff reviewed.
6. Independent reviewer checks the implementation, tests and available evidence.
   For sensitive work, security specialist also checks the controls, adversarial
   cases and integration boundaries. Reviewers perform focused checks when a
   concrete doubt warrants them, rather than repeating all earlier analysis.
7. Coordinator routes findings back to the implementer. For a behavioral defect,
   reproduce it with a failing regression test before fixing it. Reports remain
   needs-fixes until blocking findings are resolved and affected checks pass.
8. Verify the integrated branch and submit it for human review. CI reruns the
   required automated checks on the integrated revision. Production deployment
   uses team-managed automation, not an AI build-and-host service.

No agent overwrites another agent's work to resolve a disagreement. Coordinator
compares evidence against the approved specification and records the decision;
ask the students when resolving it would change product scope or requirements.

## Security skill and trigger policy

The skill is reusable procedural guidance available to implementers and
reviewers. The security specialist uses it as part of a bounded assignment.
Its eventual contents should cover threat identification, testable controls,
verification commands and evidence/reporting conventions, referencing maintained
security sources when implemented.

Invoke the specialist before and after changes to authentication, authorization,
project data isolation, LLM context/input/output handling, secrets, external
integrations, dependencies affecting a trust boundary, CI permissions or
deployment configuration. If uncertain, obtain a brief classification review.
A styling-only change ordinarily needs no specialist review.

Candidate security requirements to refine with product requirements include:
project isolation; authenticated and authorized AI endpoints; bounded input and
output; safe rendering of generated text; controlled provider errors; rate and
concurrency limits; and protection against untrusted text influencing privileged
actions. Prompt instructions do not replace application-enforced permissions.

Development-process controls include treating repository content and tool output
as untrusted input, excluding secrets from prompts and logs, least-privilege
tools and CI credentials, and separate development and production credentials.
Test these controls where executable and document manual checks explicitly.

## Testing and SoC LLM usage

Keep application behavior tests deterministic using a controlled provider
substitute at the external API boundary. Verify real validation, authorization,
request construction and output handling rather than merely asserting mock calls.
Use separately budgeted live SoC integration checks and adversarial evaluations;
record their inputs, outcomes and limitations. Passing a prompt-injection test
does not prove resistance to every possible input.

The application must use the SoC LLM. Its exact quotas and API behavior are not
yet verified: the linked guide was inaccessible through the browsing tool. Do
not invent these values. Confirm them before designing production rate limits.
Development-agent model selection is separate from the app's SoC requirement.

## Context, resource use and handoffs

Each brief supplies the task goal, specification/plan references, acceptance
criteria, security classification, allowed files, dependencies, verification
commands, resource budget and expected report. Supply relevant excerpts and
paths; do not copy the entire chat or repository into every subagent.

Handoffs record completed work, revision, tests and outcomes, unresolved findings,
decisions, blockers and the next action. Persist concise conclusions and
evidence, not hidden chain-of-thought or purported internal reasoning.

Proposed default: at most two agent rework rounds for the same unresolved
finding before coordinator diagnosis and human escalation if needed. A cap
never waives a security gate or turns failing work into approved work. Keep
concurrency and model choices explicit and within the environment's actual
allowlist. Set numeric budgets when the task and provider limits are known.

Record elapsed time, agent dispatches, review/retry rounds, tool calls and live
LLM calls. Record model identity, tokens, cached tokens and reasoning-token
counts only when exposed by the tooling; label unavailable data honestly.
Separate application usage from development-agent usage. Do not fabricate
reasoning percentages or claim access to hidden reasoning.

## Repository artifacts and evidence

Planned structure (these are not all created yet):

- `AGENTS.md`: short entry point linking the project workflow and commands.
- `workflow/specs/`: approved workflow and feature specifications.
- `workflow/plans/`: executable plans tied to specifications.
- `workflow/agents/`: project-specific role briefs and dispatch templates.
- `workflow/skills/`: versioned security guidance; the implementation plan must
  establish how the installed harness discovers or loads it.
- `workflow/templates/`: task briefs, handoffs and evidence reports.
- `workflow/scripts/`: repeatable verification and summary tooling.
- `logs/`: sanitized summaries of prompts, dispatches, handoffs, findings,
  retries, evidence references and resource measurements.
- `docs/DeveloperGuide.md`: explain the workflow and acknowledge Superpowers
  and other reused material.
- `docs/Reflections.md`: analyze concrete experiments and measured outcomes.

Preserve useful summaries beyond Superpowers' temporary working files. Associate
each record with task ID, agent role, revision and evidence path. Redact secrets
and private project content. Students verify AI-generated summaries and record
their verification status. Clearly distinguish reconstructed conversation
summaries from directly captured execution measurements.

## Acceptance criteria for the workflow setup

- One documented task demonstrates an approved specification, coordinated
  assignment, expected RED failure, GREEN result, review and human sign-off.
- One sensitive task demonstrates pre-implementation threat analysis and
  post-implementation security review with test evidence.
- A simulated review finding demonstrates regression testing, bounded rework
  and escalation without falsely marking the task complete.
- A new agent can resume a task from its handoff without the full conversation.
- Summary logs expose available resource measurements and missing data.
- Two students can follow the documented setup from their own installations.

## Decisions left to implementation planning

Choose concrete role-file formats, skill discovery mechanism, test framework,
CI configuration, evidence automation and numeric resource budgets after
checking installed tool capabilities and selecting the application stack.
Do not duplicate or modify the installed Superpowers package. Refer to it and
add project-specific policy in the repository.

This document does not select product features, architecture, hosting, or the
Developer role's AI feature. Those remain part of product requirements work.
