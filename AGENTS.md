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
Markdown task editor, ticket-first AI drafting/inline suggestions and collapsible private SoC discussion.
Tickets also support due dates, up to five assignees, delivery status/priority,
internally stored organisation-scoped references, filtered/paged lists, shared
comments and activity. Ticket fields sit beneath the editable title; AI tools,
discussion and suggestion review occupy a collapsible right panel. Ticket
references are hidden from the user interface.
Read `docs/DeveloperGuide.md` for setup/check commands.
Deployment automation and the GitHub Pages product website now exist under
`.github/workflows/` and `website/`: CI gates, a reusable deploy workflow and
separate development (`dev`) and production (`main`) environments. Both are
deployed and serving: `specforge-dev.vercel.app` and
`specforge-prod.vercel.app`, each against its own Supabase project, with
migrations applied by the workflow. GitHub Pages is not enabled yet, so the
product website is not published.
The Developer role now has its own AI feature: generated test plans on published
tickets, reviewed then saved to the ticket for the organisation. It reuses the
shared bounded SoC transport in `src/server/soc.ts`; see the developer guide.
PM AI reliability/provider-wide quotas and hosted deployment remain unverified.
`npm run verify` (lint, typecheck, unit tests, `next build`) passes on Node 22,
and CI run 42550277324 on pull request #2 applied every migration to a
disposable local Supabase and passed all 56 database tests (including the 4 for
test plans) and the browser suite. The test plan panel still has no browser
check of its own. Both role AI features have now been executed against SoC LLM
(`SPECFORGE_LIVE_AI=1 npx vitest run src/tests/soc-live.manual.test.ts`); the
observed provider behaviour, including an unavailable model and a gateway
deadline, is recorded in the developer guide. Hosted deployment remains
unverified.
Do not invent passing checks or treat future product scope as implemented.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
