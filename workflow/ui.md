# Shared UI policy

Both student-owned feature sets use one app shell and shared UI components.
The organisation workspace is the initial representative screen. React is
selected; the first slice uses shared controls under `src/components/` and CSS
theme tokens in `src/app/globals.css`. shadcn/ui remains optional, not installed.

- Define colors, type scale, spacing, radii and focus styles once in theme tokens.
- Reuse navigation, page headers/action bars, forms, status badges and request cards.
- Use shared loading, empty, validation and error states across PM/Developer pages.
- Feature pages compose shared elements; do not introduce separate page palettes,
  competing button variants or copied form controls.
- Check keyboard/focus behavior, accessible labels and responsive layouts in the browser.
- For each meaningful UI change, compare against the approved reference screen
  and at least one page from the other role. UI consistency is checked in code
  review and browser evidence, not guaranteed by prompts alone.

## Back links

Use `BackLink` from `src/components/ui.tsx` for page-level back navigation. It
pairs the link label with a decorative left arrow and shared icon spacing. Use
`fullPage` for ticket routes that already use document navigation so the
editor's unsaved-change warning still applies.

## Fixed-choice dropdowns and pills

Use `Dropdown` from `src/components/ui.tsx` for new fixed-choice dropdowns. Its
interface is `id`, `label`, `value`, `options: {value, label, tone?}[]`, `onChange`,
and optional `disabled`. Values are controlled; the module owns popup state,
keyboard/focus handling, outside-click dismissal and scrolling. Optional `tone`
renders an option with the shared `Pill` presentation. Empty options disable the
trigger. Options must have unique values and the supplied value should be one
of them. Keep the selected label meaningful without color.

`Pill` uses centralized `--pill-*-bg/ink` tokens and supports gray, yellow,
orange, red, blue, purple and green. Ticket presentation mappings live in
`ticket-pills.tsx`, shared by dropdowns and read-only/list displays. Priority is
Low/yellow, Medium/orange, High/red. Status is To do/gray, In progress/blue,
In review/purple, Done/green, Cancelled/gray.

Existing account/filter native selects remain supported by the shared field
styles; migrate them when their behavior needs changing. Searchable multiple
assignee selection remains a specialized combobox rather than a fixed dropdown.

## Date picker

Use `DatePicker` from the shared UI library for calendar-only optional dates.
It accepts `id`, `label`, `value: string | null`, `onChange`, optional `disabled`
and `form`. The module owns DayPicker, popup/focus, pending exact-date text and
validation. A valid selection, Today or Apply commits YYYY-MM-DD; Clear commits
null. Dismissal cancels pending text. Invalid Apply preserves the selected date.

The pinned `@daypicker/react` stylesheet loads once before theme overrides.
Calendar colors use existing purple brand tokens. Read-only date presentation
stays in the ticket display. Do not use UTC serialization or year-remapping
Date constructors for calendar-only values. The exact-entry range is years
0001–9999; calendar navigation is bounded to the same range.
