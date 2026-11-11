# Component test tier and browser-test visibility

Status: approved by the user on 2026-11-12.

## Problem

Course feedback says SpecForge lacks UI unit and integration tests. It has
51 Playwright journeys in `src/tests/browser/` that run in CI, but no component tests:
none of the 24 components in `src/components/` has a test of its own. Every UI
behaviour, down to a dropdown keystroke, therefore needs the slow, serial,
database-backed browser suite. A recent run took 18.6 minutes, and four of its
failures passed on a focused rerun. Accessibility is checked only by hand. The
test layers are not documented in one place, so reviewers cannot see the coverage.

## Behaviour

1. **Component tests.** Add a Vitest project for `src/**/*.test.tsx` that runs in
   real Chromium through Vitest browser mode with the Playwright provider. The
   project already uses Playwright, and the shared components depend on browser
   APIs that jsdom lacks or fakes: native `<dialog>.showModal`, layout from
   `getBoundingClientRect`, `scrollIntoView` and focus behaviour. Tests render one
   component with its required providers, such as `NotificationProvider`. They act
   only through roles, labels and the keyboard, and assert what the user can
   observe and the callbacks the component makes. They need no network, Supabase
   or SoC access.
2. **First slice of component tests:**
   - `Modal`: opens as a labelled modal dialog, focuses its content region, locks
     body scroll, and calls `onClose` on Escape and on the close button. It
     restores body scroll on unmount.
   - `Dropdown`: exposes a labelled combobox and listbox, opens and selects by
     mouse and keyboard (arrows, Enter, Escape, typeahead), closes on an outside
     pointer, reports the chosen value, and stays inert when disabled.
   - `DatePicker`: applies a typed exact date, rejects impossible dates such as
     `2026-02-30`, clears the date, and passes calendar dates through without
     shifting the timezone.
   - `ChangeReview`: lists each change with its accessible label. Accept, Reject,
     Undo, Accept all and Reject all report the right fields and IDs. It shows
     changes that are outdated against the current fields, reports skipped changes
     from Accept all, disables accepting while blocked, and keeps focus on the
     acted row.
3. **Automated accessibility.** Add `@axe-core/playwright` to the browser fixture
   with a helper that fails on serious or critical violations. Call it from
   existing journeys on: sign-in, the requests page, a ticket with its AI panel,
   the change-review modal, profile, and organisation management. Component tests
   also run axe on each rendered component. Fix any violations found, or record
   them in the session log with a reason if a fix is out of scope.
4. **Smoke subset.** Tag about eight critical browser journeys `@smoke`: sign-up
   and sign-in, create and publish a request, assignment and delivery, the AI
   draft and review flow (fake AI), and membership. Add
   `npm run test:e2e:smoke`. CI runs the full browser suite as it does now and
   uploads the Playwright HTML report as an artifact on every run, including
   failures.
5. **Visibility.** Add a "Test layers" section to `docs/DeveloperGuide.md`.
   It covers each layer (logic unit, component, database integration, browser
   end-to-end, accessibility), what it owns, where it lives and its command.
   Update `workflow/README.md` so a UI behaviour change adds a component test when
   the behaviour belongs to one component. A browser journey is added when the
   behaviour crosses the server or several components.

## Acceptance criteria

- `npm test` runs the existing logic tests and the new component tests, so
  `npm run verify` and the CI verify job cover them. CI installs Chromium for that
  job.
- The four components above have passing component tests that cover the listed
  behaviours. Each test was seen to fail first for its intended reason (TDD).
- Component tests finish in under 60 seconds locally and need no local Supabase.
- `npm run test:e2e` runs axe on the listed pages without serious or critical
  violations, and `npm run test:e2e:smoke` runs only the `@smoke` journeys.
- CI uploads the Playwright report artifact.
- The Developer Guide test-layer section and the workflow rule are updated.
- No application behaviour changes beyond accessibility fixes found by axe.

## Permissions and failures

Test-only tooling: no new secrets, network calls, or provider or database
access from component tests. Browser tests keep their existing local-only origin
and Supabase guards. A missing Chromium install fails with Playwright's
install hint, not a silent skip.

## Exclusions

No visual or screenshot regression testing, no cross-browser matrix beyond
Chromium, no coverage-percentage gate, no tests for every component in this
change, and no rewrite of existing browser journeys apart from tags and axe calls.
Removing the browser suite's flakiness (serial run, slow 18-minute runs) is
investigated separately. This change does not try to solve it.

## Module and test boundaries

- Component tests live next to their component as `src/components/<name>.test.tsx`
  and render it through a shared `src/tests/render.tsx` helper that supplies
  providers. The public interface under test is each component's props and its
  accessible DOM.
- Browser journeys stay in `src/tests/browser/` and test the app over its HTTP
  API with the fake AI. The axe helper lives in `src/tests/browser/ui.fixture.ts`.
- Pure logic, such as `ticket-changes`, stays in the existing `.test.ts` unit
  tests. Component tests do not repeat its edge cases.
