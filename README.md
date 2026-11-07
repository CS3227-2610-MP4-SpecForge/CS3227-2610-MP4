# SpecForge

A shared workspace for Product Managers and Developers. The initial slice
implements verified email accounts, member-scoped organisations, invitations
and admin/member management, plus private PM drafts and explicitly published
feature requests with a two-field editor, AI drafting and inline suggestions,
and collapsible private SoC discussion.
The partner-owned Developer AI remains unimplemented.

Use Node.js 24 and Docker Desktop:

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
- [Product specification](workflow/specs/2026-11-07-product-mvp.md).
- [Workflow](workflow/README.md).

No hosted deployment or GitHub Pages product website is configured yet.
