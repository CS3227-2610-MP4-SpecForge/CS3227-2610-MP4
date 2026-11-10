# Profile page

Status: approved by the user on 10 Nov 2026.

## Goal and presentation

Give signed-in users a polished personal account page with a small, useful scope.
Add Profile above Sign out in the existing navbar dropdown, linking to `/profile`.
Use the shared theme, responsive spacing, focus styles and UI controls.

- Profile header: generated initial avatar, current username, application-role
  badge, and “Member since 10 Nov 2026” using the actual account creation date.
- Account details: editable username, read-only email with verified status, and
  read-only application role. Explain that the role was chosen at signup.
- Username editing: explicit Save changes and Cancel; Save disabled when unchanged
  or pending; existing length/format/lowercase/reserved-prefix/uniqueness rules.
  Inline validation and recoverable save failures; concise success feedback.
  Refresh the navbar immediately after success. Existing ticket labels use the
  current profile username; account IDs and ownership remain unchanged.
- A small Your organisations section uses the existing organisation list,
  showing names and Admin/Member labels with a Manage organisations link.
  Meaningful empty state for accounts without organisations.
- Loading, retry and signed-out redirect states; accessible keyboard operation;
  confirm departure when username edits are unsaved, including Sign out.

## Permissions and failures

Only a verified account may read/change its own profile. Username editing must
not permit role, email, creation date or another account to be changed. Validate
on the server and enforce uniqueness atomically. No global username search or
availability checker. Security preflight requires direct anonymous/unverified RPC
denial, narrow function execution grants, validation within storage and concurrent
unique-claim coverage. Reviewed before implementation. Previous names are not
reserved; existing labels show the current name while ownership remains UUID-based.

## Testing interfaces

- HTTP/account and disposable database seams: own-account update/persistence,
  invalid/reserved/duplicate names, unauthorized access and rejection of extra
  protected fields. These check enforcement, not page appearance.
- Existing Playwright UI seam: Profile navigation, displayed identity/date/role,
  successful rename and immediate navbar refresh, validation/error/retry,
  Cancel/departure protection and mobile/keyboard behavior for PM/Developer.
  These check rendered integration, not hosted deployment or physical devices.
- Repository lint/typecheck/unit/build plus focused integration/browser checks;
  independent security preflight/final review and code/UI review.

## Exclusions

Photo uploads, bio/social links, activity dashboards, email/password changes,
account deletion, notification settings, theme selection and public profiles.
No invented account dates or usage metrics. Update guides and the session log.
