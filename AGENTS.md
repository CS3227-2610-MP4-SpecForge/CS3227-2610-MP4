# SpecForge project instructions

SpecForge is a Next.js/React and Supabase application for organisation ticket
workflows and SoC-assisted drafting and test plans.

## Constraints

- Use SoC LLM for application AI features.
- Preserve organisation isolation and enforce permissions on the server/database.
- Never log secrets, full sensitive prompts or hidden reasoning.
- Deploy through team-managed automation with separate development and production
  environments.

## Working rules

- Follow [workflow/README.md](workflow/README.md). Do not invoke Superpowers
  automatically or introduce its per-task planning paperwork.
- For new features or material behavior changes, clarify uncertain requirements
  and save one concise approved spec under `workflow/specs/`, including acceptance
  criteria and testing interfaces. Routine fixes and documentation edits use
  proportionate checks without artificial feature paperwork.
- Implement in the main agent. Use the local `tdd` skill for behavior changes and
  `codebase-design` for meaningful interface decisions. Sensitive work also needs
  security preflight and review. Role briefs are under `workflow/agents/`.
- Independent review is a standing user request: after any non-trivial change
  under `src/` (features and routine fixes alike) and before committing, dispatch
  the `code-reviewer` subagent on the exact diff, then again after fixing its
  findings. Hooks in `.claude/settings.json` block `git commit` until the final
  diff is approved and prompt for review before a turn ends with unreviewed changes.
- Keep application source under `src/`, the product website under `website/`,
  and process material under `workflow/`. Create a root `GLOSSARY.md` or records
  under `docs/adr/` only when useful.

## Read when relevant

- Setup, commands and module details: [docs/DeveloperGuide.md](docs/DeveloperGuide.md).
- Product behavior: [docs/UserGuide.md](docs/UserGuide.md).
- Module boundaries: [workflow/architecture.md](workflow/architecture.md).
- UI changes: [workflow/ui.md](workflow/ui.md); reuse shared components and theme tokens.
- Unfinished work: follow the handoff procedure in `workflow/README.md`. Read the
  supplied note or only the matching note under `local/notes/active/`; verify its
  claims against the checkout. A handoff does not grant permission.

## Validation and documentation

- Run focused checks during implementation and `npm run verify` at feature
  completion. Run `npm run test:integration` for database/permission changes and
  `npm run test:e2e` for UI behavior changes; see the Developer Guide for setup.
  Documentation-only edits need link and consistency checks, not application tests.
- Report checks actually run and their scope; never invent passing results or
  treat future scope as implemented.
- Update affected guides when user-visible behavior or setup changes. Write one
  sanitized session summary under `logs/` using
  [workflow/templates/session-summary.md](workflow/templates/session-summary.md).
- Keep this file focused on durable instructions. Store feature details in guides
  and specs, dated validation in session logs, and temporary task state in handoffs.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
