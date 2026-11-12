# 2026-11-12: Consistent session expiry

- Changes: workstream B of
  [the MP3 feedback spec](../workflow/specs/2026-11-12-mp3-feedback-improvements.md).
  `api` now emits one shared signal: a 401 from any call outside `/api/auth/`
  means "signed out", and a later successful call means "active". Sign-in's own
  401 for rejected credentials is excluded. `SessionBanner`, mounted once in the
  root layout below the header, shows a persistent alert with a plain
  **Sign in again** link and never redirects, so the editors' departure guards
  apply. On public pages, where the account menu's check is expected to fail,
  a 401 hides the banner instead. The editor turns a save 401 into a retryable problem that
  stops autosave. The request list and delivery controls no longer treat 401 as
  "no permission". The workspace and profile pages keep their redirect, and 403
  stays in place. A dedicated banner component replaces the spec's
  `SessionProvider` because the state needs no React context. Guides and
  `workflow/ui.md` updated.
- Validation (local only; hosted deploys are blocked): `npm run verify` passed
  (lint, types, 212 tests, build) and `npm run test:e2e` passed 54/54 on port
  3001 against local Supabase. New component tests cover: the banner appearing
  once while the editor text stays; autosave stopping; a 403 staying in place;
  sign-in's 401 being ignored; the public-page rule; the banner hiding after a
  client redirect to sign-in; and the banner clearing after a later success. The
  new Playwright journey signs out in a second tab, then edits a ticket. It
  checks that the banner appears, the text stays, and the link triggers the
  departure guard.
- Review: the code reviewer found that the banner stayed visible on `/sign-in`
  after the workspace's client redirect. That is fixed with a regression test.
  It also found a misplaced Developer Guide section, now moved. The 401 signal
  is now read before the body is parsed, so a non-JSON 401 also shows the
  banner.
- Visual check: the user checked the banner on a scrolled ticket page and
  found its placement fine.
- Follow-up (same day): after a 401 the old three-second toast also showed the
  server's "Sign in to continue." and covered the banner. A non-auth 401 from
  `api` now carries `sessionEndedMessage` (the banner's text), which the
  notification provider never toasts; the editor's 401 note stays inline only.
  A first attempt that muted every toast while the session had ended was
  rejected in review because it hid unrelated warnings such as skipped AI
  changes; the narrower rule keeps them. Validation: component tests 30/30
  (the new test fails without the filter), lint, types, `npm test` (213 passed,
  83 skipped), build, and `npm run test:e2e` 54/54 on port 3001. The code
  reviewer approved the final diff.
