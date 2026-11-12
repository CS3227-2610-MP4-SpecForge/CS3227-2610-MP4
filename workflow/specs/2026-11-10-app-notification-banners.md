# Consistent app notification banners

Status: approved by the user on 2026-11-10.

## Behavior

- Use the existing shared top-centre overlay banner for transient action outcomes
  throughout the app: membership/admin actions, organisation creation, account
  forms/sign-out/profile updates, request/list actions, delivery changes, comments,
  copying links, AI requests and test-plan actions. Include the last-admin failure
  quoted by the user. Replace corresponding inline success/error notices.
- Success/information uses existing purple styling; errors/failures use shared red
  danger colors and an alert announcement. Both use the existing three-second
  lifetime. Repeated identical notifications restart the lifetime. The newest
  notification replaces the previous one, avoiding overlapping independent banners.
- Position relative to the viewport above the active modal, without consuming
  layout space, shifting content, stealing focus or blocking pointer interaction.
  Support mobile wrapping and existing keyboard/modal focus behavior.
- Keep loading/progress, empty states, field-specific validation/hints, save state,
  unsaved/conflict state and saved AI failure history contextual. These are ongoing
  states or content, rather than transient action notifications. When a failed
  action also sets a blocking state, its banner can expire while that state and its
  existing retry/reconciliation controls remain available. Do not remove disabled
  states, preserve-input guarantees or recovery controls.
- Keep signup verification navigation available after the signup success banner
  expires. Preserve existing confirmation dialogs and browser-native validation.
- Notification expiry must not clear underlying error/blocking state, retry keys,
  local edits, authentication state or server authorization decisions.

## Module and implementation scope

- Extend shared NotificationBanner with success/error presentation and keep the
  shared UI export. Add one shared client notification mechanism and an accessible
  overlay host, including explicit active-dialog hosting, rather than separate
  timer/state code at every call site. A small notify interface owns event identity,
  replacement, timeout cleanup and repeated identical events.
- Migrate existing invitation banners to this mechanism as well. Do not change
  server responses, permissions, storage, provider transport or backend behavior.
- Preserve the existing uncommitted initial-modal-focus fix and approved specs.
- Update shared UI guidance, user/developer documentation where applicable, and
  the current sanitized session log. No commit/push/deployment unless requested.

## Proposed testing interfaces

Use the existing Playwright rendered-UI seam for:

- Last-admin failure as a red overlay above management with no layout shift,
  three-second dismissal and retained working controls.
- Success/error actions on authentication/profile, request/delivery/comment flows,
  and existing invitation creation/withdrawal. Update selectors from inline owner
  sections to the shared accessible notification host.
- Repeated messages, replacement instead of overlap, timer restart/cleanup, modal
  focus preservation, mobile layout and verification-link availability after expiry.
- Existing save/reconciliation, failed AI history, input preservation and retry
  checks remain intact; banners do not replace those behavior checks.

Use existing unit/HTTP tests as backend regression evidence, without new private
state tests. Implement in main agent with local tdd/codebase-design skills; one
independent read-only code/UI reviewer at completion. This is presentation only;
request separate security review if implementation expands into authorization,
AI transport/context or another sensitive area. Run npm run verify and the full
browser suite; report actual failures, reruns and unavailable checks.
