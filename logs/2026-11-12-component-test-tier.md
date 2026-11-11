# 2026-11-12: Component test tier and accessibility checks

- Changes:
  - Responds to feedback that SpecForge lacked UI unit and integration tests, per
    [the spec](../workflow/specs/2026-11-12-component-test-tier.md).
  - Added a Vitest browser-mode `component` project: real Chromium through the
    Playwright provider, pinned to a UTC+8 timezone. It includes a shared
    `renderComponent` helper and an axe check.
  - Component tests cover `Modal`, `Dropdown`, `DatePicker` and `ChangeReview`
    through roles, labels and the keyboard. They run in `npm test`, and
    therefore in `verify` and CI.
  - Browser journeys gained an `expectAccessible` axe helper on sign-up, sign-in,
    the requests table, the ticket editor, the change-review modal, organisation
    management and profile.
  - Eight journeys are tagged `@smoke` and run with `npm run test:e2e:smoke`.
    CI installs Chromium for verify and uploads the Playwright HTML report.
  - The Developer Guide has a test-layers table; the workflow README says when to
    add a component test versus a browser journey.
- Accessibility fixes found by axe (WCAG 2.5.3, label in name), with no visual
  change:
  - The due-date button's name now includes its shown date.
  - The brand link's "S" mark is drawn by CSS.
  - The account button's name is the visible username and email plus a hidden
    "Account options".
  - Browser locators that matched the old exact names were updated.
- Validation:
  - `npx vitest run`: 185 passed, 83 database tests skipped. The component
    project runs 22 tests in about 2s.
  - Full `test:e2e`: 53 passed in 2.7 minutes, run before the final
    test-only and CSS fallback fixes. The smoke and affected journeys passed
    again after the accessibility fixes.
  - `npm run verify` passed: lint, typecheck, tests and build. This was after
    `tsconfig.json` was changed to exclude the ignored `local/` experiment
    folders, whose stale files had broken typecheck in this checkout.
  - Mutation checks: breaking each key behaviour failed its component test.
    The one accepted survivor is Dropdown's outside-pointer handler, whose
    effect duplicates the blur handler.
- Review: The independent reviewer found an untested Accept all skip notice and
  a timezone test that could not fail on UTC CI. Both were fixed, and each was
  shown to fail under a mutation with the host set to UTC. The re-review
  approved. A fresh session then ran the registered `code-reviewer` agent on the
  final diff; it approved, and the review gate recorded the approval.
- Open:
  - Accept all cannot fully apply a proposal like "Keep\nOld\nKeep" becoming
    "Keep\nKeep\nKeep". It reports the skip correctly, but `ticketDiff` or
    `applyChange` could handle this case.
