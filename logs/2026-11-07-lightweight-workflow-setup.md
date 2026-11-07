# Lightweight workflow setup

Human verification: pending. AI-generated summary of this setup session.

## Prompts and decisions

- User raised Superpowers/Codex efficiency concerns and asked for a setup that
  clarifies brief requirements, supports good architecture, limits overhead and
  standardizes UI. User supplied Anthropic's article about folding subagents
  into the main loop and mentioned Matt Pocock's skills.
- Assistant read the article, actual skill sources and relevant primary docs,
  distinguishing issue reports from evidence about this project's token use.
- User selected the proposed setup: main-agent clarification/design/TDD,
  independent code/architecture review at feature boundaries, and a specialized
  security reviewer before/after sensitive work. Minimal documentation and shared
  UI code replace repeated per-task handoffs and duplicated reports.

## Work performed

- Installed six selected Matt Pocock skills and their supporting files at commit
  `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` in project-local `.agents/skills/`.
- Added the project-authored `specforge-security` skill and two reviewer briefs.
- Added root project instructions, the active workflow, architecture/UI policies,
  one session-summary template, pinned provenance and the upstream MIT license.
- Marked the old Superpowers design and setup plan superseded. The earlier
  user-edited discussion summary was preserved.
- Documented five locally adapted upstream files: lookup delegation, TDD/review
  routing, Codex invocation metadata and safe offline architecture-report guidance.

## Actual agent handoffs and findings

- Independent code/architecture reviewer received active workflow paths, approved
  intent and a read-only scope. Approved with two minor path-clarity suggestions;
  both were addressed (root logs location and lazy glossary/ADR exceptions).
- Independent security reviewer received its role brief, the shared skill and
  the new files. Found executable CDN scripts/loose Mermaid settings in the
  optional upstream report template. Status was needs-fixes.
- Main agent changed the report instructions to escaped text, static CSS/SVG,
  no external/active content and a restrictive CSP. A focused follow-up security
  review approved the process-documentation change. One security rework round.
- Reviewers did not implement changes or dispatch children. Their reports were
  returned to the main chat; this summary persists their conclusions.

## Verification and limits

- Bundled skill validator initially could not import PyYAML. Installed PyYAML
  6.0.3 in an isolated temporary venv; no application dependency was added.
- Initial validation identified Claude-only frontmatter fields in two upstream
  skills. Removed them while preserving Codex's explicit-only invocation policy.
- Reran the bundled validator: all seven skills passed. Checked explicit-only
  policies for grill-me/architecture audit, local project Markdown links and
  byte comparison against the pinned upstream checkout: exactly the five
  documented files differ. `git diff --check` passed.
- This is installation/configuration/documentation, not application behavior:
  no application RED/GREEN test results, CI/deployment results or live SoC calls.
- Explicit file loading was exercised by reviewers. Native skill discovery must
  be confirmed on a subsequent turn/fresh chat; file validation is not proof of
  automatic selection. No generated architecture report was browser-tested.
- Superpowers remains installed; repo instructions supersede its workflow.
  Plugin metadata already in this chat cannot be removed by repository files.
  No supported repo-only disable toggle was verified for this installed plugin.

## Resources and next action

- Observed: two reviewer dispatches, one focused security follow-up, one security
  rework round. Local validation reruns addressed actual failures.
- Token/cache/reasoning-token usage, total elapsed time, complete tool-call count
  and costs: unavailable/not collected. No token-saving percentage is claimed.
- Next: use a fresh chat if skill discovery needs refresh; disable Superpowers
  in the client for a clean plugin context. Continue SpecForge requirements,
  especially the Developer AI feature, before choosing a stack or scaffolding.
