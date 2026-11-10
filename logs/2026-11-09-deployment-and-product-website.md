# Session summary: 2026-11-09 / deployment pipeline and product website

Human verification: pending
Revision or working diff reviewed: branch `feat/deploy-and-pages`, based on
`e7f6be8`

- Prompts and requests (sanitized summary of all development interactions): the
  user asked for an audit of the repository against the MP4 requirements, then
  chose to close the deployment and product-website gaps first. Two decisions
  were put to the user and answered: host on Vercel driven from GitHub Actions,
  and use two hosted Supabase projects, one per environment.
- Agreed behavior / specification and decisions:
  `workflow/specs/2026-11-09-deployment-and-product-website.md`. `master` is
  production and `dev` is development; secrets live in per-environment GitHub
  Environments; runtime configuration lives in Vercel's Preview and Production
  scopes; migrations are applied by the deploying workflow before the deploy
  step; Vercel's own Git integration stays disconnected so the automation is
  team-managed; the Pages site copies the guides from `docs/` at build time
  rather than duplicating them.
- Implementation or documentation changes: added `.github/workflows/ci.yml`,
  `deploy.yml` (reusable), `deploy-development.yml`, `deploy-production.yml` and
  `pages.yml`; added `website/_config.yml` and `website/index.md`; extended
  `.gitignore` for the generated site and copied guides; added a Deployment and
  environments section to the developer guide, including the first-time setup
  checklist and a description of every `workflow/` artifact; corrected the
  README, user guide and `AGENTS.md` statements about deployment. No application
  source was touched.
- Tests/checks: command, expected and observed result; RED/GREEN for behavior
  changes: this is a configuration and documentation change, so no application
  behaviour changed and no unit test was added. YAML parse check over all five
  workflows and `website/_config.yml` passed. `npm run lint` could not run when
  this was written (the fresh clone had no `node_modules`); later in the same
  session, after Node 24 was installed and `npm ci` run, `npm run verify` was
  observed green, so lint, typecheck, the unit suite and `next build` all pass
  with these files in the tree. No CI, deploy or Pages workflow has executed
  anywhere, so the workflows themselves remain unproven.
- Agent dispatches: role, scope/context supplied, result and handoff: none. The
  work was carried out in the main chat. The security specialist was not
  dispatched, although the workflow classifies CI/deployment permissions as
  sensitive; least-privilege permissions, no `pull_request_target`, pinned
  verified-publisher actions, suppressed CLI output and reviewer-gated production
  were applied from the existing security guidance directly. An independent
  security review of these workflows is outstanding.
- Review findings, resolution and retries: no independent review yet. One
  self-correction during implementation: the Pages job first copied `docs/*.md`
  verbatim, which Jekyll would have published unrendered because the guides carry
  no front matter; the copy step now prepends empty front matter and
  `_config.yml` supplies the layout.
- Resource measurements: elapsed time, tool/dispatch/retry counts, optional
  tokens/cache; unavailable if not captured: one chat session, approximately 20
  tool calls, zero subagent dispatches, zero retries, zero provider calls to SoC
  LLM and zero hosted database operations. Token and cache figures were not
  captured.
- Remaining work / next action (use as a handoff only if unfinished): the
  pipeline is unexercised. A human must complete the seven first-time setup steps
  in the developer guide (branch protection, two Supabase projects, the Vercel
  project and its scoped variables, two GitHub Environments with six secrets
  each, Pages set to build from Actions, then a push to `dev`), confirm the
  development deployment, and only then record the URLs in the user guide and on
  the product website. `website/index.md` still has two team-member placeholders.
  Custom SMTP on both Supabase projects is a separate outstanding task without
  which hosted signup will not work for peer testers. A security review of the
  workflow permissions is recommended before the first production deploy.
