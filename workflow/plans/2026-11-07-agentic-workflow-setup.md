# Initial Agent Workflow Setup Implementation Plan

**Superseded:** retained as history. The user selected main-agent implementation
with selective independent review instead. Use [../README.md](../README.md);
do not execute this plan or interpret its unchecked tasks as current obligations.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the next SpecForge coding task use the approved TDD and security workflow through a small set of repository instructions.

**Architecture:** Reuse Superpowers for implementer and independent-reviewer dispatch. Add project coordination rules and a security-specialist brief; expose shared security guidance through one project-local skill. This is instruction/configuration work, not an agent runtime or application implementation.

**Tech Stack:** Markdown, existing Superpowers plugin, Codex project-local skill discovery. No new dependencies.

**Spec:** `workflow/specs/2026-11-07-agentic-workflow-design.md`

**Status:** Revised after user feedback that the previous plan was too broad; awaiting review. The approved design remains the long-term workflow; this plan covers its initial setup only.

## Global Constraints

- Follow specification-driven development and TDD.
- A security review is separate from implementation and from general review.
- Neither reviewer creates further subagents. Students approve specifications and merge decisions.
- Do not duplicate or modify the installed Superpowers package.
- Consolidate development workflow material under `workflow/` and sanitized interaction summaries under `logs/`.
- Do not fabricate reasoning percentages or claim access to hidden reasoning.

## What will actually be created

| File | Concrete contents and effect |
| --- | --- |
| `AGENTS.md` | A short instruction to read the project workflow, use TDD for behavior changes, classify security-sensitive tasks and record evidence. Applies to future work in this repository. |
| `workflow/README.md` | Exact coordinator sequence: approved spec -> bounded assignment -> TDD -> independent review -> security review when triggered -> completion report. Maps implementer/reviewer to existing Superpowers templates. |
| `workflow/agents/security-specialist.md` | Dispatch brief for a fresh, read-only specialist: supplied scope/revision, preflight threat cases or post-change findings, severity/evidence/verdict, and no delegation. |
| `.agents/skills/specforge-security/SKILL.md` | Discoverable metadata named `specforge-security` and instructions to load the canonical guide below. |
| `workflow/skills/specforge-security/guide.md` | Shared triggers and procedure: identify trust boundaries, specify testable controls, inspect relevant evidence, report gaps; do not expose secrets or treat prompts as authorization. |
| `workflow/templates/task-record.md` | One combined brief/report/handoff template: task ID, spec, revision, ownership, security classification, RED/GREEN evidence, reviews, retries, decisions, available usage and next action. |
| `logs/workflow-setup-summary.md` | Short factual record of setup checks, actual limitations and pending human verification. |

No separate coordinator agent is installed: the main chat coordinates using
`workflow/README.md`. No replacement implementer or general-reviewer definitions
are created: the existing plugin supplies their templates. Role briefs are
explicitly loaded when dispatching; files alone do not start agents.

## Review Focus

- Inert instructions: verify one actual role dispatch.
- Broken skill path: verify explicit loading and distinguish it from native discovery.
- Security late in the process: require classification before implementation.
- False TDD evidence: distinguish observed test failure from a test-harness error or retrospective claim.
- Missing measurements: use unavailable, never invented zeroes or percentages.

## Task 1: Add the project coordination entry point

**Files:** Create `AGENTS.md`, `workflow/README.md`, `workflow/agents/security-specialist.md`, and `workflow/templates/task-record.md`.

**Interfaces:** Main chat reads the workflow; task implementers/reviewers receive the existing plugin templates plus the relevant project constraints. Specialist receives its brief and the shared guide. All reports identify task and revision.

- [ ] Write the coordinator sequence and plugin role mapping. State the security triggers: auth, authorization, project isolation, LLM handling, secrets, trust-boundary integrations/dependencies, CI permissions and deployment.
- [ ] Define TDD as observed expected RED -> minimal GREEN -> refactor; require regression tests for defects. Do not invent application test commands before a stack exists.
- [ ] Write the read-only security brief with preflight and post-change modes. Keep it separate from implementation and general review.
- [ ] Write the combined task record. Include allowed files/dependencies, relevant context paths, two rework rounds then diagnosis/escalation, and unresolved findings that remain blocking. Label usage fields unavailable when not exposed.
- [ ] Run `git diff --check`; check that repository links resolve. Dispatch one fresh reviewer with these files and the approved design. Expected: concrete compliance findings or approval; no edits or further delegation.
- [ ] Resolve blocking findings and commit this task's files.

## Task 2: Add and verify the shared security skill

**Files:** Create `.agents/skills/specforge-security/SKILL.md`, `workflow/skills/specforge-security/guide.md`, and `logs/workflow-setup-summary.md`; update workflow instructions only if checks reveal a defect.

**Interfaces:** Skill metadata uses `name: specforge-security`. Its body loads `../../../workflow/skills/specforge-security/guide.md` relative to the skill directory. Both implementer and security specialist use the same guide.

- [ ] Use `skill-creator` and `superpowers:writing-skills` for skill creation and behavioral validation. Read their requirements first; record actual checks, including any baseline scenarios they require.
- [ ] Write the guide using authoritative OWASP application/LLM security and GitHub CI-permissions references verified at implementation time. Cover project data isolation, controlled AI input/output, provider errors/resource limits and development-process secrets/permissions. Leave exact SoC quotas unverified until the provider guide is accessible.
- [ ] Verify guide loading from the checked-out path. Check native discovery in a fresh session when available; otherwise record discovery as unverified and document explicit loading as the usable fallback.
- [ ] Exercise classification with a typography change (no specialist) and a project-authorization change (preflight and post-change specialist). Label these as workflow scenarios, not application security tests.
- [ ] Record actual prompts/outcomes, review findings and available usage in the setup summary. Run `git diff --check` and obtain independent general and security review before committing.

## Done means

The seven files above exist; their links resolve; actual review/classification
checks are recorded; explicit security-skill loading works; native discovery is
reported honestly; and the main chat has clear instructions for the next coding
task. There is no new agent server, daemon, app source or test framework.

## Deferred until real feature development

Application TDD and security-test evidence; CI/deployment and enforcement;
resource instrumentation and quantitative comparisons; synthetic retry and
handoff experiment suites; full developer/user guides and reflections; and
teammate-machine verification. These remain obligations of the approved design,
not acceptance claims for this initial setup. Introduce scripts only when a real
repeated task justifies them.

## Self-review

The initial setup supplies the coordinator policy, plugin role mapping,
specialist brief, shared skill and one record template. Every deferred design
obligation is listed explicitly. Checks exercise workflow behavior rather than
adding unit tests that merely mirror documentation. No product requirements or
application stack decisions are introduced.
