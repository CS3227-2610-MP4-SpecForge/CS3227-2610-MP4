# SpecForge development workflow

The main agent clarifies, designs and implements; specialized subagents provide
independent scrutiny. Do not invoke Superpowers automatically or introduce its
per-task planning paperwork.

## Everyday use

For new features or material behavior changes:

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
   Dispatch the `code-reviewer` subagent (`.claude/agents/code-reviewer.md`, which
   loads its role brief) on the exact diff before committing; this also applies to
   routine fixes under `src/`. A review gate hook enforces this in Claude Code.
   Sensitive features also get a separate security review. Fix behavioral defects
   through regression tests; run affected checks again after fixes.
6. The main agent writes one concise, outcome-focused session log using
   [the summary template](templates/session-summary.md): changes, final validation,
   material review fixes and open issues. Human reviews/merges the feature.

Routine fixes do not require a new feature spec unless they change agreed behavior
or testing interfaces; clarify material ambiguity before coding.

No automatic implementer subagent per edit, repeated full-suite runs without a
reason, or separate handoff documents between these steps. Create a short handoff
only when transferring unfinished work. Docs-only changes get relevant checks,
not artificial unit tests. UI changes also get browser checks for consistency,
accessibility and loading/error/empty states. Test a UI behaviour that belongs to
one component with a component test (`src/components/<name>.test.tsx`); add a
browser journey when it crosses the server or several components. See the
Developer Guide's test layers.

## Commits

- **One purpose per commit.** A test tier and an unrelated bug fix are two
  commits. A bulk reformat is its own commit, listed in `.git-blame-ignore-revs`.
- **Conventional prefix**, then a lowercase imperative summary of at most about
  72 characters: `feat:` (new behaviour), `fix:` (wrong behaviour corrected),
  `refactor:` (same behaviour, new structure), `test:`, `docs:`, `style:`
  (formatting only), `chore:` (tooling and configuration).
- **A `fix:` says the corrected behaviour**, not the symptom or the change:
  `fix: stop the session-ended toast covering the session banner`, not
  `fix: toast bug` or `fix: update notifications.tsx`.
- The body, when needed, says why and names any deliberate behaviour change,
  for example `refactor: split API routing into …` recording its one intended
  404 change.
- Never commit secrets, personal files or generated output; stage files by name
  rather than with `git add -A`.

## Resuming unfinished work

At a meaningful pause or transfer of unfinished work, keep one short handoff at
`local/notes/active/<task>.md` (create the directory only when needed). This folder
is ignored by Git; pass the note explicitly when moving to another checkout or
machine. Do not create a handoff for every edit or completed task. Update the same
note in place instead of appending a transcript. Aim for 150–250 words; omit empty
fields and link authoritative evidence rather than copying it.

Use this format:

```markdown
# <unfinished task>

Updated: <date, time and timezone>. State: <in progress or blocked>.
Base: <commit and relevant working changes, when needed to interpret evidence>.

- Objective and scope: <agreed outcome and spec or decision reference>.
- Current state: <implemented, verified and pending work, clearly separated>.
- Relevant files: <three to five paths and why each matters>.
- Decisions and constraints: <consequential choices, permissions and exclusions>.
- Evidence: <observed checks and scope/revision; link details and identify gaps>.
- Next action: <one concrete starting action and the next validation needed>.
- Blocker: <missing decision/dependency and owner; omit if none>.
```

On resumption, read the supplied note or inspect active filenames and open only
the matching note. If none exists, use the agreed spec and relevant session
summary; do not load every historical note. Check the current revision, relevant
working changes and referenced evidence before dependent work. Flag stale or
conflicting facts. Notes are reference material, not renewed approval for live
calls, deployment or scope changes, and never contain secrets or hidden reasoning.

When a recovery check is useful, ask a fresh agent to read `AGENTS.md` and the
handoff and identify the next action, constraints and missing evidence in at most
150 words. Correct material omissions. This checks recovery, not efficiency
savings. On completion, preserve useful decisions in the existing spec or guide,
write the normal session outcome once, and remove the active note. Do not link
temporary handoffs from durable documentation or maintain a second history.

## Coordination and resource limits

The main chat owns task ordering and one writer per checkout. Give each reviewer
the spec path, base/head or exact working diff, relevant files, existing test
evidence and its role brief. Do not copy the full conversation. Reviewer output:
verdict, concrete findings with file/line evidence, and checks/limitations.
Return compact reports to the main chat; record material findings, their resolution
and any outstanding blockers once in the session summary. Reviewers are read-only
and never dispatch children.

Use the environment's available models deliberately; avoid inheriting an
expensive model/effort blindly. At most two rework rounds for the same unresolved
finding, then diagnose/escalate. A cap never waives blocking findings. Resolve
disagreements against the specification and evidence; ask the user when scope
would change. Add parallel workers only for substantial independent work.

Record resource measurements only when requested or relevant to a performance/cost
investigation, using captured data. Omit unavailable-metric boilerplate. App usage
and coding-agent usage are separate; never guess measurements.

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

See [THIRD_PARTY.md](THIRD_PARTY.md) for pinned skill provenance and local adaptations.

## Artifact map

- `agents/`: the two explicit reviewer briefs, loaded when dispatched.
- `architecture.md`, `ui.md`: short shared engineering policies.
- `specs/`: feature specifications and historical workflow decisions.
- `drafts/`: agent drafts of personal work (such as Reflections) awaiting the
  author's rewrite; never final text, and removed once moved.
- `templates/session-summary.md`: concise session-log format and omission rules.
- Repository-root `logs/`: session outcomes, validation and unresolved work.
- `docs/AcceptanceIndex.md`: each feature's spec, tests, logs and hosted check;
  add a row when a feature spec is approved and update it when evidence changes.

Keep workflow files here except native-discovery `.agents/skills/` and root
`AGENTS.md`; domain terms may live in root `GLOSSARY.md` and significant decision
records in `docs/adr/`, matching the installed skills. Create both lazily.
Document their purpose in the developer guide when introduced. Keep product
behavior and setup in the guides, dated validation in session logs, and temporary
state in handoffs; do not maintain a current-state inventory in `AGENTS.md`.
