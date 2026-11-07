# SpecForge project instructions

Use the lightweight workflow in [workflow/README.md](workflow/README.md).
It replaces the earlier Superpowers-led workflow for this repository; do not
invoke Superpowers automatically or maintain its per-task planning paperwork.

- Clarify uncertain requirements before coding; save one concise approved feature
  spec under `workflow/specs/`. Agree testing interfaces in that spec.
- Implement in the main agent using the local `tdd` and `codebase-design` skills.
  Use one independent code/architecture reviewer at feature boundaries, plus the
  security specialist before/after sensitive work. See role briefs in `workflow/agents/`.
- Reuse shared UI and theme tokens; read `workflow/ui.md` for UI changes and
  `workflow/architecture.md` when choosing module boundaries. Do not load all docs for every edit.
- Keep source under `src/`, process material under `workflow/`, and one sanitized
  summary per session under `logs/`. Update guides when user-visible behavior changes.
  Native skills, a root `GLOSSARY.md` and decision records under `docs/adr/` are
  natural exceptions; create glossary/ADRs only when useful, not for every task.
- Do not log secrets, full sensitive prompts, hidden reasoning or invented metrics.
- The app must use SoC LLM; exact provider limits are unverified. Deployment must
  use team-managed automation with separate development/production environments.

Current state: no application scaffold, stack, build or test commands exist yet.
Do not invent passing checks. Complete product requirements before scaffolding.
