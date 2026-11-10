# Deployment pipeline and product website

Status: implemented on `feat/deploy-and-pages`; hosting provider accounts and
secrets are still pending human setup. Nothing below claims a verified live
deployment.

## Problem and users

The application runs only on a developer machine. Peer testers and graders have
no URL, and the course requires team-managed deployment automation with a real
separation between development and production, plus a GitHub Pages product
website. No build-and-host environment provided by a coding agent may be used.

## Decisions

- Host: Vercel, driven by the Vercel CLI inside GitHub Actions. The repository
  owns the trigger, the gates and the order of steps; Vercel's own Git
  integration is deliberately not used, so the automation stays team-managed.
- Branches: `main` is production, `dev` is development. Feature branches open
  pull requests into `dev`.
- Two hosted Supabase projects, one per environment. Migrations are pushed by
  the same workflow that deploys, development first.
- Secrets live in two GitHub Environments, `development` and `production`, not in
  repository-wide secrets. Production requires a reviewer, so a deploy to
  production is an explicit human decision.
- Runtime configuration (`APP_ORIGIN`, Supabase URL/keys, SoC LLM settings) is
  held in each Vercel project's Production scope. GitHub holds only
  the credentials the pipeline itself needs.
- Website: Jekyll on GitHub Pages, built by `actions/jekyll-build-pages` from
  `website/` with the existing guides copied in at build time. The guides stay
  single-source in `docs/`; the site never holds a second copy.

## Behaviour

1. `ci.yml` runs on every pull request and on pushes to `dev`/`main`: lint,
   TypeScript, unit/HTTP tests and a production build, then database and browser
   tests against a disposable local Supabase stack. No job touches a hosted
   project, the SoC LLM or any real key.
2. `deploy.yml` is a reusable workflow: apply migrations, `vercel pull`,
   `vercel build`, `vercel deploy --prebuilt`, then record the deployment URL in
   the run summary.
3. `deploy-development.yml` calls it on every push to `dev` with the development
   project's production
   target and the `development` environment.
4. `deploy-production.yml` calls it on every push to `main` with the production
   target and the `production` environment, and only after `ci.yml` has passed
   on that commit.
5. `pages.yml` publishes the product website on pushes to `main` that change
   the site or the guides.

## Permissions and failure handling

- Workflows declare least privilege: `contents: read` everywhere except the
  Pages job, which needs `pages: write` and `id-token: write`.
- No workflow runs on `pull_request_target`, and no workflow checks out or runs
  code from a fork with secrets in scope.
- Third-party actions are pinned to a major version from verified publishers
  only (`actions/*`, `supabase/setup-cli`); the Vercel step uses the CLI pinned
  to an exact version in the workflow rather than a community action.
- A failed migration step stops the run before the deploy step, so the schema and
  the application cannot diverge silently.
- `supabase db push` output is not echoed, matching the existing rule that CLI
  output may carry credentials.
- Production deployment requires the environment reviewer; an unreviewed push to
  `main` leaves production untouched and the run waiting.

## Out of scope

- Custom SMTP for hosted email verification. The pipeline does not make hosted
  signup work on its own; that remains a separate configuration task.
- Any live run of these workflows, any hosted migration and any change to a
  hosting account. None was performed here.
- Rollback automation, uptime monitoring and load testing.

## Test boundaries

Workflow and site changes are configuration, not application behaviour, so they
get no artificial unit tests. The checks are: `actionlint` reasoning applied by
review, a successful `ci.yml` run on the pull request, and a successful Pages
build. The existing `npm run verify` suite still guards the application.
