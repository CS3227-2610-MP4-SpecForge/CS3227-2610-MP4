# Navbar account menu

Status: approved through the user’s instruction to proceed with the additional heading-row removal.

## Behavior

- The SpecForge brand links to `/workspace`, the Organisations page.
- Remove the Workspace navbar link. For signed-in accounts, show their existing
  username with their email beneath it in its place.
- Hovering the account control reveals a dropdown with Sign out. Clicking or
  keyboard activation also opens it for touch and keyboard users. Escape and
  clicking outside dismiss it; keyboard focus can reach Sign out.
- Sign out uses the existing endpoint and returns the user to sign-in. Disable
  repeat submissions and show a recoverable error if sign-out fails. Respect the
  existing ticket unsaved-work confirmation before ending the session; cancelling
  keeps both the session and local edits.
- Hide the account control when signed out. Refresh identity after client-side
  authentication/navigation so the persistent navbar stays current.
- Remove the entire existing account summary beside the Organisations heading,
  including its role badge, email and Sign out button. Account details and sign-out
  live in the navbar only.
- Use shared theme tokens and fit narrow/mobile screens.

## Scope and permissions

Presentation only: reuse the current account and sign-out endpoints; no changes
to authentication, permissions, account storage or username rules.

## Agreed testing interface

Use the existing Playwright browser seam for both PM and Developer accounts:
assert brand navigation, username/email display after sign-in, hover and
keyboard/touch menu operation, dismissal, sign-out success/failure and mobile
layout. This checks rendered behavior and existing endpoint integration;
it does not re-test authentication internals or live hosted deployment.
Run relevant browser coverage plus repository lint, typecheck, unit tests and
build; record unavailable checks honestly. Independent read-only code/UI review
at completion. Update the user guide and a sanitized session summary.
