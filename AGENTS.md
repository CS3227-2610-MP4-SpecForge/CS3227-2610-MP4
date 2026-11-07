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

Current state: approved initial product specification under `workflow/specs/`;
Next.js/React and Supabase scaffold with verified accounts and initial
organisation workflow, including invitations and membership/admin management, plus the manual request
lifecycle (private drafts, publication and author-only editing), a two-field
Markdown task editor and private SoC AI clarification/proposals.
Read `docs/DeveloperGuide.md` for setup/check commands.
PM AI reliability/provider-wide quotas and hosted deployment remain unverified;
the partner-owned Developer AI remains unfinished.
Do not invent passing checks or treat future product scope as implemented.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
