# 2026-11-12: Move hosting from Vercel to Render

- Changes: Vercel blocked deploys of teammates' commits, so both environments
  move to Render web services declared in `render.yaml` (`specforge-dev` on
  `dev`, `specforge-prod` on `main`, auto-deploy off). `deploy.yml` keeps its
  order (migrations, deploy, release check). Its Vercel CLI steps and the `.git`
  workaround are replaced by `src/tooling/render-deploy.mjs`, which asks the
  Render API to deploy the exact commit and waits for `live`. `next.config.ts`
  takes the build's revision from `RENDER_GIT_COMMIT`. Pipeline secrets are now
  `RENDER_API_KEY` and `RENDER_SERVICE_ID` per GitHub Environment. See the
  Developer Guide's Deployment section. The services set no Render health check
  path, so a Supabase outage cannot fail a deploy or restart the app; the
  release check still covers the database. Blueprint auto-sync must be off.
- Validation: `npm run verify` passed. A build with `RENDER_GIT_COMMIT` set
  embeds the SHA. The deploy script rejected malformed arguments and reported a
  401 cleanly for an invalid key against the real API. All workflow and
  Blueprint YAML parses.
- Open: no Render deploy has run yet. Create the services from the Blueprint,
  enter runtime variables, add the two secrets to both GitHub Environments,
  point each Supabase Site URL at the new origin, then push to `dev`. Confirm
  the `onrender.com` hostnames Render assigns and correct the docs if they
  differ.
