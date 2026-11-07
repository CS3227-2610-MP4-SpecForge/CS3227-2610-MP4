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
