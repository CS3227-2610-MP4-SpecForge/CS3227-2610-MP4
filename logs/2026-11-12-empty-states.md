# 2026-11-12: Helpful empty states

- Changes: workstream H of
  [the MP3 feedback spec](../workflow/specs/2026-11-12-mp3-feedback-improvements.md).
  - An empty requests list now depends on the viewer's role. PMs read "No
    tickets yet. Select **New task** to draft one; it stays private until you
    publish." Developers read "No published tickets yet. Tickets appear here
    when a Product Manager publishes them."
  - The test plan panel used to show a failed load as a three-second
    notification, then claim "No test plan yet." It now keeps the error on
    screen with **Retry loading test plan** until a read succeeds, and shows
    the empty text only after a successful load. The button follows the app's
    existing "Retry loading …" labels rather than the spec's bare **Retry**.
  - The User Guide describes both.
- Validation:
  - New component tests (`request-list.test.tsx`, `test-plan-panel.test.tsx`)
    cover each role's text, the empty plan after a successful load, and a
    failed load showing its error and retry, then recovering. The three
    behaviour tests failed before the change.
  - `npm run verify` (230 passed, 84 skipped) and the full browser suite (54),
    with two browser assertions updated to the new texts.
- Review: approved with no blocking findings. Noted, not changed: pressing a
  "Retry loading …" button moves keyboard focus to the page body while it
  reloads. The profile and request editor share this pattern, so it is a
  cross-cutting follow-up rather than part of this change.
