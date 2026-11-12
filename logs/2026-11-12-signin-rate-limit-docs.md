# 2026-11-12: Truthful sign-in rate limit (workstream D)

- Changes: Documentation only, per option (a) of
  [the MP3 feedback spec](../workflow/specs/2026-11-12-mp3-feedback-improvements.md).
  Confirmed in `src/server/application.ts` and `runtime.ts` that
  `createAuthAdmission` is one in-memory counter per server process, shared by
  sign-up, sign-in, verify and resend, allowing 30 attempts per clock minute.
  The [Developer Guide](../docs/DeveloperGuide.md) now says the cap applies
  separately on each instance, grows with the number of Vercel instances, resets
  on restart, and that Supabase Auth's rate limits are the real control.
  First-time setup step 7 and spec user action 3 now include checking the hosted
  Supabase Auth rate limits; hosted values were not recorded because they have
  not been checked.
- Validation: Local links and anchors in the edited files resolve (script
  check); every description of the limit in `docs/` and `workflow/` agrees. No
  application tests run, as nothing under `src/` changed.
- Open: User action 3 — read each hosted project's Auth rate limits.
