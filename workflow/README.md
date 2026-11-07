# SpecForge development workflow

Active decision: user selected this lighter setup on 2026-11-07. It supersedes
the initial Superpowers design and setup plan. The main agent clarifies, designs
and implements; specialized subagents provide independent scrutiny.

## Everyday use

1. Start from a brief request. Use `$grill-me` for a new/unclear feature; inspect
   existing code for facts rather than asking the user. Stop when behavior,
   permissions, failure cases, scope and testing interfaces are agreed.
2. Save one short feature spec in `workflow/specs/`: problem/user, behavior,
   acceptance criteria, permissions/failures, exclusions, module/test boundaries.
   Explicit user approval of that spec starts implementation; it also approves
   its test interfaces. Add a separate implementation plan only for a complex change.
3. Classify security impact. For auth, authorization, project isolation, LLM
   input/context/output, secrets, trust-boundary integrations/dependencies or
   CI/deployment permissions, dispatch the security specialist in preflight mode.
   Incorporate its testable requirements before coding. Styling alone normally skips it.
4. Implement a vertical slice in this chat. Use `$codebase-design` for meaningful
   interface decisions and `$tdd`: one expected RED failure, minimal GREEN, then
   small behavior-preserving refactoring with tests green. Work against public
   behavior; substitute the external SoC provider for deterministic local tests.
5. Run focused tests while working and the project suite at feature completion.
   Dispatch one independent code/architecture reviewer using its role brief.
   Sensitive features also get a separate security review. Fix behavioral defects
   through regression tests; run affected checks again after fixes.
6. Summarize actual prompts/decisions, tests, review findings, rework and available
   resource use once in the session log. Human reviews/merges the feature.

No automatic implementer subagent per edit, repeated full-suite runs without a
reason, or separate handoff documents between these steps. Create a short handoff
only when transferring unfinished work. Docs-only changes get relevant checks,
not artificial unit tests. UI changes also get browser checks for consistency,
accessibility and loading/error/empty states.

## Coordination and resource limits

The main chat owns task ordering and one writer per checkout. Give each reviewer
the spec path, base/head or exact working diff, relevant files, existing test
evidence and its role brief. Do not copy the full conversation. Reviewer output:
verdict, concrete findings with file/line evidence, and checks/limitations.
Return compact reports to the main chat; store their conclusions in the session
summary. Reviewers are read-only and never dispatch children.

Use the environment's available models deliberately; avoid inheriting an
expensive model/effort blindly. At most two rework rounds for the same unresolved
finding, then diagnose/escalate. A cap never waives blocking findings. Resolve
disagreements against the specification and evidence; ask the user when scope
would change. Add parallel workers only for substantial independent work.

Track time, dispatch/retry/tool/provider-call counts when captured. Tokens, cache
hits and reasoning-token counts are optional provider measurements, not guesses.
Record unavailable data explicitly. App usage and coding-agent usage are separate.
This setup has no measured token-saving percentage yet.

## Installed skills and onboarding

Project-local skills are versioned in `.agents/skills/`; cloning the repository
gets the same files. They should be available on the next turn; use a fresh chat
if the client does not refresh discovery. Verify the skill appears before claiming
automatic loading works. Without a Skill tool, read its `SKILL.md` directly and
follow it; nested skill references mean load that installed skill by name.

- `grill-me` -> `grilling`: explicit requirements interview.
- `codebase-design`: design guidance loaded when interfaces matter.
- `tdd`: observable behavior tests and one behavior at a time.
- `improve-codebase-architecture`: optional explicit milestone/hotspot audit,
  not a prerequisite for each feature. It can launch an explorer and create an HTML report.
- `domain-modeling`: dependency of that audit; glossary/ADRs created only when useful.
- `specforge-security`: shared guidance for implementer and security specialist.

We intentionally did not install Matt's `implement-spec`, `code-review`, or his
whole plugin. Our reviewer brief avoids automatic dual review. See
[THIRD_PARTY.md](THIRD_PARTY.md) for pinned provenance and local adaptations.

Superpowers remains installed in the desktop environment. This repository's
instructions opt out of its workflow, but cannot remove plugin metadata already
in a running chat. For a completely clean context, disable Superpowers in the
client's plugin settings and start a fresh chat; a repo-only toggle was not
verified for this installed universal-directory plugin. Do not uninstall it globally.

## Artifact map

- `agents/`: the two explicit reviewer briefs, loaded when dispatched.
- `architecture.md`, `ui.md`: short shared engineering policies.
- `specs/`: feature specifications and historical workflow decisions.
- `templates/session-summary.md`: one summary that also captures reviews and usage.
- Repository-root `logs/`: summaries of development interactions, including this setup.

Keep workflow files here except native-discovery `.agents/skills/` and root
`AGENTS.md`; domain terms may live in root `GLOSSARY.md` and significant decision
records in `docs/adr/`, matching the installed skills. Create both lazily.
Explain them in the developer guide when application implementation
begins. No app security, deployment or submission completeness is claimed yet.
