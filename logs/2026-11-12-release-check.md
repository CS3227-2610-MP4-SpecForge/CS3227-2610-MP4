# 2026-11-12: Release identity and post-deploy check

- Changes: workstream C of
  [the MP3 feedback spec](../workflow/specs/2026-11-12-mp3-feedback-improvements.md).
  Public, uncached `GET /api/health` returns `{ status, revision, database, ai }`
  with fixed words and the commit SHA only; 503 when the database is
  unreachable. The database check calls a new anon-callable
  `public.health_check()` (reads no table) with the publishable key and a
  3-second deadline, because anon has no other grant. The AI check reuses the
  SoC configuration rule, now exported as `socConfigured`, and makes no model
  call. The Build step passes `github.sha` as `SPECFORGE_REVISION`, which
  `next.config.ts` fixes into the build. A final **Check the release** step runs
  `src/tooling/check-health.mjs` against each caller's new `site-url` input.
  It polls the public URL, not the per-deployment one, for up to 3 minutes. See
  the Developer Guide's Release check section.
- Validation: health unit tests (12) and an integration test against local
  Supabase. Against a local `next start` built with the HEAD SHA, the script
  failed with "a different build is still answering" for a mismatched SHA and
  passed on attempt 1 for the matching one. It also failed cleanly with nothing
  listening, and rejected malformed arguments.
- Review: approved with no blocking findings, including a security preflight:
  the probe reads no table and gives an attacker nothing beyond calling the
  public RPC directly. Applied suggestions: the healthy-case test also checks
  that no model ID appears, the job limit is now 25 minutes to fit the 10-minute
  deploy deadline plus the check, and `site-url` reaches the step through `env`.
- Open: live confirmation waits for Vercel to lift its block on this team. The
  new migration reaches hosted projects on the next deploy.
