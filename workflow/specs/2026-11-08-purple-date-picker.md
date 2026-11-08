# Purple due-date calendar

Status: approved by the user on 2026-11-08.

## Choice and appearance

The current due-date input is a native `type=date` field, so its calendar is
browser-controlled. There is no shared calendar module in the repository.
Use React DayPicker behind a reusable DatePicker in the shared UI library;
check the installed package/version and its documentation before implementation.
DayPicker's official documentation supports custom CSS variables, keyboard
navigation, single-date selection and integration with input fields.

Style a rounded white calendar popover with the site's purple theme tokens:
purple selected day, soft lavender hover/focus states, a distinct today marker,
compact weekday headings, clear month/year navigation and matching icon buttons.
Use existing typography, borders, radii and lucide icons. Keep the popup within
the viewport on mobile and desktop.

## Behavior and invariants

- Clicking the due-date field or calendar icon opens the custom calendar.
  Selecting a day commits the date and closes the calendar. Provide Today and
  Clear date actions. The field remains optional and Clear means Unscheduled.
- Keep an efficient way to enter an exact date and navigate months/years.
  Validate typed dates before committing; incomplete/invalid input must not
  silently clear the saved date or submit as a valid date. A pending typed date
  can be applied explicitly in the popup; dismissal cancels that pending edit.
- Opening uses the selected month (or today's month when empty). Support
  keyboard day navigation/selection, Escape dismissal with focus restored,
  normal Tab navigation and outside-click dismissal without changing the date.
- Keep dates as calendar-only YYYY-MM-DD strings, without UTC/timezone shifts.
  Retain existing server date validation/range, author-only editing, disabled
  states, draft autosave and published Update behavior. Read-only views retain
  their current date/Unscheduled display.

## Interface, tests and scope

Expose a controlled DatePicker (`id`, `label`, `value: string | null`,
`onChange`, `disabled`, optional form association) from the shared UI library.
Own calendar display, date parsing/formatting, popup/focus and pending exact-date
input inside this module. Reuse it for the ticket due-date field; document it
in workflow/ui.md and the guides.

Approved test interface: browser ticket editor for selected-month opening,
month/year navigation, day selection, Today/Clear, exact-date validation,
keyboard/focus/dismissal, draft reload and published Update persistence, plus
desktop/mobile screenshots and author/Developer consistency. Existing HTTP and
database date tests continue to validate storage; no new storage interface.

Use local TDD/codebase-design skills, dependency security preflight/review,
independent code review, relevant project checks and visual QA. Add only the
calendar dependency and its required dependencies; no UI framework rollout,
backend/migration/permission change, hosted action or live-provider calls.
