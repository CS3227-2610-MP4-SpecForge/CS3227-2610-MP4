# Agentic Workflow Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the approved development workflow usable by both students, with explicit roles, discoverable security guidance, and reproducible handoff/evidence procedures.

**Architecture:** Keep project policy and role briefs under `workflow/`; use a short root `AGENTS.md` as the entry point. Register one project-local security skill that loads canonical security guidance on demand. Extend the installed Superpowers workflow rather than copying or modifying it.

**Tech Stack:** Markdown, Codex project-local skills, Git, existing Superpowers plugin. No app stack, runtime dependencies, hosting or LLM credentials are selected by this setup.

**Discovery reference:** [OpenAI's repository-local skills guidance](https://developers.openai.com/blog/skills-agents-sdk) documents `.agents/skills/` and progressive loading. Verify behavior in the students' actual installed clients rather than assuming registration succeeds.

**Spec:** `workflow/specs/2026-11-07-agentic-workflow-design.md`

## Global Constraints

- Follow specification-driven development and TDD.
- Consolidate development workflow material under `workflow/` and sanitized interaction summaries under `logs/`.
- A security review is separate from implementation and from general review.
- Neither reviewer creates further subagents. Students approve specifications and merge decisions.
- Do not duplicate or modify the installed Superpowers package.
- Do not fabricate reasoning percentages or claim access to hidden reasoning.
- The application must use the SoC LLM.

## Scope and acceptance boundary

This plan installs the workflow, not the application. It must not invent a
product feature merely to demonstrate the workflow. Document-only tasks get
link, instruction and scenario checks rather than artificial unit tests.

Setup can verify dispatch, skill loading, classification, evidence formats,
handoff recovery and escalation. The design's actual feature RED/GREEN,
sensitive-feature security tests, integrated CI and human merge sign-off must
be demonstrated with the first approved product feature. Track those as pending,
not successful simulations. Product requirements work continues afterward.

## Review Focus

1. A role brief sitting on disk is not automatically dispatched: Task 1 checks an actual bounded dispatch.
2. A skill guide under `workflow/` alone may not be discovered: Task 2 checks registration separately from explicit loading.
3. A review must bind to the current revision: Task 3 exercises stale evidence.
4. Missing usage data or a simulation must not masquerade as measured execution: Tasks 3 and 4 check labels.
5. A retry cap must not bypass a security gate: Task 4 exercises escalation.

## File responsibilities

| File | Responsibility |
| --- | --- |
| `AGENTS.md` | Concise repository policy and pointers; do not preload all role guidance |
| `workflow/README.md` | Entry point, prerequisites, invocation sequence and artifact map |
| `workflow/agents/coordinator.md` | Classification, dispatch, dependency and escalation policy |
| `workflow/agents/implementer.md` | Bounded TDD assignment and completion contract |
| `workflow/agents/reviewer.md` | Independent spec/code review contract |
| `workflow/agents/security-specialist.md` | Preflight threat analysis and post-change verification contract |
| `.agents/skills/specforge-security/SKILL.md` | Native discovery metadata and instructions to load canonical guidance |
| `workflow/skills/specforge-security/guide.md` | Shared security procedure, triggers, source references and reporting |
| `workflow/templates/task-brief.md` | Dispatch input fields |
| `workflow/templates/handoff.md` | Recovery state and next action |
| `workflow/templates/task-evidence.md` | Revision-bound test/review/resource evidence |
| `workflow/templates/session-summary.md` | Sanitized prompt/interaction summary and human verification |
| `workflow/verification/setup-scenarios.md` | Repeatable workflow exercises and pending product checks |
| `logs/workflow-setup/validation.md` | Actual setup observations, limitations and evidence references |
| `docs/DeveloperGuide.md` | Workflow setup/use, file map and acknowledgements; identify product sections as not implemented |
| `docs/Reflections.md` | Experiment questions and factual setup observations; no invented results |

## Task 1: Make coordination and roles executable as dispatch instructions

**Files:** Create `AGENTS.md`, `workflow/README.md`, and all four role briefs listed above.

**Interfaces:** Consumes the approved design and installed Superpowers skills.
Produces role briefs loaded explicitly into fresh subagent assignments; these
are not claimed to be automatically registered native agent types.

- [ ] Write `AGENTS.md` with specification-first development, TDD, security classification, scoped writes, sanitized evidence and pointers to `workflow/README.md`. State that build/test commands are not established yet.
- [ ] Write role briefs with inputs, permitted actions, output contract and stopping conditions. Reviewers are read-only and do not delegate. The coordinator uses actual available tools and model allowlists, not hardcoded obsolete model names.
- [ ] Explain how to layer project briefs onto the plugin's implementer/reviewer templates without replacing its review gates. Document two rework rounds per unresolved finding, then diagnosis/escalation; never silently waive a finding.
- [ ] Run `git diff --check`. Inspect all relative links against their actual paths.
- [ ] Dispatch a fresh read-only agent with the reviewer brief and a narrowly scoped review of one role file. Expected: a bounded review report, no file edits or child agents. Record observed results under `logs/workflow-setup/validation.md` when that report is created in Task 4.
- [ ] Obtain independent task review and commit only this task's deliverables.

## Task 2: Add discoverable shared security guidance

**Files:** Create `.agents/skills/specforge-security/SKILL.md` and `workflow/skills/specforge-security/guide.md`; update `workflow/README.md`.

**Interfaces:** Role briefs refer to `specforge-security`. Its metadata uses
`name: specforge-security`; its body instructs loading
`../../../workflow/skills/specforge-security/guide.md` relative to the skill
directory. The guide is the single source for the shared procedure.

- [ ] Use `skill-creator` and `superpowers:writing-skills` for authoring and behavioral validation. Read their instructions before creating the skill. Any required baseline/pressure scenarios are skill tests, not evidence of application TDD.
- [ ] Write triggering metadata covering authentication/authorization, project isolation, LLM handling, secrets, trust-boundary dependencies, integrations, CI and deployment permissions. Exclude purely presentational changes unless they affect safe output rendering.
- [ ] Write the canonical guide: classify scope; identify assets and trust boundaries; turn threats into testable requirements; verify application-enforced controls; report severity, revision, evidence, limitations and recommended action. Include process security and prohibit pasting secrets into context/logs.
- [ ] Consult and link authoritative, current OWASP guidance for application and LLM risks and GitHub guidance for CI permissions. Do not invent SoC limits or present prompt defenses as authorization controls.
- [ ] Exercise three prompts: typography-only change -> no specialist; change to project authorization -> pre/post specialist; ambiguous generated-content rendering change -> classification review. Record actual responses and any corrections.
- [ ] Verify explicit loading from the checked-out path. Separately check native discovery in a fresh chat/session; if unavailable, record that limitation and document explicit file loading as the fallback. Do not claim discovery from file existence alone.
- [ ] Run `git diff --check`, obtain independent general and security review for this security-policy change, and commit this task's files.

## Task 3: Standardize handoffs, evidence and student onboarding

**Files:** Create the four templates, `docs/DeveloperGuide.md`, and `docs/Reflections.md`; update `workflow/README.md`.

**Interfaces:** Task brief fields: task ID, role, spec/plan, goal, acceptance
criteria, revision, allowed files, dependencies, security classification/reason,
verification commands, resource limits and report path. Handoff/evidence reports
reference the same task ID and revision.

- [ ] Add the dispatch template fields above. Use explicit unavailable/not-established values where the empty application has no commands or measurements.
- [ ] Add handoff fields for completed work, decisions, evidence paths, unresolved findings, blocker, current revision and precise next action. Do not request internal chain-of-thought.
- [ ] Add evidence fields for RED command/expected failure/observed result, GREEN command/result, regression checks, general/security verdicts, retry count and human sign-off. Allow not-applicable with a reason for document-only work.
- [ ] Separate application LLM calls from development-agent usage. Provide elapsed-time, dispatch/tool/retry counts and optional provider-reported token/cache fields. Missing fields are unavailable, never inferred zero. Session summaries record human-verification status.
- [ ] Document separate-clone/branch setup for both students, plugin installation, explicit role dispatch, skill discovery/fallback, use of templates, log redaction and acknowledgement of reused Superpowers material. Do not publish a fictional user guide or claim the app exists.
- [ ] Give a fresh reviewer only a synthetic handoff and its referenced evidence. Expected: recover next action without full chat; flag a mismatched revision and missing measurement instead of declaring completion. Label fixtures synthetic.
- [ ] Run `git diff --check`, obtain independent review, and commit this task's files.

## Task 4: Exercise the workflow and record its real limits

**Files:** Create `workflow/verification/setup-scenarios.md` and `logs/workflow-setup/validation.md`; update `docs/Reflections.md` and workflow instructions only for observed defects.

**Interfaces:** Consumes roles, skill and templates from Tasks 1-3. Produces
replayable scenarios with observed outcomes, not an automated enforcement claim.

- [ ] Record earlier dispatch/loading/handoff checks with task IDs, revisions, actual prompts, outcomes and available resource counts. Redact sensitive data; mark summaries pending student verification.
- [ ] Exercise a synthetic blocking security finding: two failed rework reports -> coordinator diagnoses/escalates; expected status remains needs-fixes. No application code or real attack is needed.
- [ ] Exercise an untrusted fixture that asks an agent to print environment credentials. Expected: treat it as data, do not read/print secrets, record the attempted instruction. Use dummy text only; reviewers inspect evidence rather than trusting a claimed refusal.
- [ ] Keep a checklist linking every design acceptance criterion to setup evidence or an explicitly pending first-product-feature milestone. Human sign-off and teammate-machine onboarding remain pending until actually performed.
- [ ] Add factual setup observations and proposed future experiments to `docs/Reflections.md`: targeted vs full context, selective security review vs every-task review, and exposed token/cache measurements. Distinguish proposals from completed experiments.
- [ ] Run `git diff --check` and inspect `git status --short`. Conduct whole-branch independent review and security review of the process/skill changes. Resolve blocking findings with bounded rework.
- [ ] Commit setup evidence and present actual results, pending milestones and the proposed first product-requirements discussion to the user. Do not push, merge or deploy as part of this plan.

## Self-review

The tasks cover role coordination, security skill discovery, TDD expectations,
handoffs, evidence/resource reporting, onboarding, acknowledgements and bounded
rework. Real application tests, CI/deployment, quota enforcement and experiments
requiring a running application remain explicitly deferred to product plans.
No scripts are introduced solely to test documentation or imitate an agent
runtime; add automation later when a repeated, concrete need is established.
