# SpecForge

A shared workspace for Product Managers and Developers. The initial slice
implements verified email accounts, member-scoped organisations, invitations
and admin/member management, plus private PM drafts and explicitly published
feature requests with a two-field editor, AI drafting and inline suggestions,
and collapsible private SoC discussion. Developers get the second role AI
feature: generated test plans on published tickets, reviewed and then saved to
the ticket for the whole organisation.

Use Node.js 22 and Docker Desktop:

```sh
npm ci
npm run db:start
npm run db:env
npm run dev
```

Open <http://localhost:3000>. Local verification emails appear in the disposable
inbox at <http://127.0.0.1:55324>. `db:env` writes ignored `.env.local` and leaves
your `.env` unchanged. Never put real project credentials in guides or test data.

- [User Guide](docs/UserGuide.md): current features and testing access.
- [Developer Guide](docs/DeveloperGuide.md): design, setup, checks and deployment gates.
- [Acceptance index](docs/AcceptanceIndex.md): each feature's spec, tests, session logs
  and hosted-verification state.
- [Product specification](workflow/specs/2026-11-07-product-mvp.md).
- [Workflow](workflow/README.md).

Deployment automation and the GitHub Pages product website live in
`.github/workflows/` and `website/`. The pipeline is team-managed: GitHub Actions
applies migrations and triggers Render deploys, with separate development and
production environments, each against its own Supabase project. They deploy to:
<https://specforge-prod.onrender.com> and <https://specforge-dev.onrender.com>. See
[Deployment](docs/DeveloperGuide.md#deployment-and-environments).
