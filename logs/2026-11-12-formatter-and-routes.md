# 2026-11-12: Formatter and route split

- Changes: workstream E of
  [the MP3 feedback spec](../workflow/specs/2026-11-12-mp3-feedback-improvements.md).
  - Prettier 3.10.1 is pinned, with a 120-character print width and the
    existing `x =>` arrow style. `npm run verify`, and so CI, now starts with
    `format:check`. Markdown, YAML and the process folders stay hand-formatted.
    The reformat is one commit, listed in `.git-blame-ignore-revs`.
  - `application.ts` routing now sits in ordered route tables in `auth.ts`,
    `organisations.ts` and `account.ts`, matched by `routes.ts` (first match
    wins). `createApplication` keeps the origin check, health check, auth
    admission and identity check in the same order.
  - Guard entries keep the old answers exactly, for example "Not found." for
    membership paths and "Organisation not found." for other organisation
    lookups. The Developer Guide's module list and Checks section describe both.
- Validation:
  - The reformat changes no behaviour. Before and after, the TypeScript syntax
    trees, the compiled JSX and the parsed CSS match, apart from Prettier's
    equivalent rewrites.
  - A temporary differential test sent 1,800 requests (paths, methods, bodies
    and user states) to the old and new `createApplication`; every status and
    body matched. Deleting one guard route made it fail.
  - One deliberate HTTP change, which the differential did not cover: the old
    code cut a fixed 19 characters off any `GET /api/invitations/...` path, so
    `/api/invitations/a/<organisation id>` returned the caller's own
    organisation. It now answers 404 "Organisation not found." The lookup was
    always limited to the caller's memberships, so nothing leaked. A test in
    `application.test.ts` now covers it; it fails on the pre-split code.
  - On the reformat and again on the split: `npm run verify` (225 passed, 84
    skipped), integration 79/79 and the browser suite 54/54. After the final
    move of one helper and comment edits, the format check, type check, lint
    and the application, health and failure-logging tests (54/54) were rerun.
- Review: the reformat was approved with no blocking findings. Reviewing the
  split found the `/api/invitations/a/<id>` difference above; it is kept as
  the intended fix. Organisation reads now sit beside the schemas they use.
