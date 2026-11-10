# Email-addressed invitations and temporary notification

Status: approved by the user on 2026-11-10.

## Behavior

- An organisation admin can invite any valid email address, whether registered
  or not. Persist the invitation immediately and show it under Outgoing
  invitations. Remove the misleading generic success message and registered-email
  restriction in the form copy. No invitation email delivery is added.
- Store invitation intent against the trimmed, case-insensitive email address.
  A recipient who registers later sees it after verifying that email and can
  accept without another invitation. Acceptance grants ordinary membership only.
- Preserve seven-day expiry and explicit resend for expired invitations. Expired
  invitations remain visible. Duplicate sends reuse the outstanding invitation
  without extending its expiry or creating duplicates; show “Invitation already
  pending.” Existing members receive a clear “Already a member” error.
- Outgoing shows pending, expired and declined invitations; label declined rows.
  Accepted and cancelled invitations disappear from this operational list.
  Cancel is available to organisation admins for any not-yet-accepted invitation
  (including expired/declined), at the far right of its row. Preserve confirmation
  and pending/error handling. Declined invitations require a fresh invitation to
  invite again. Cancel must never revoke accepted membership.
- On successful creation, show “Invitation created.” in a shared top-centre
  notification banner for three seconds, replacing the inline success notice for
  this action. Successful cancellation shows “The invitation has been withdrawn”
  through the same banner for three seconds. Repeated notifications restart the
  duration. Keep failures persistent.
  Both banners are viewport overlays above the open modal: they occupy no modal
  layout space, do not shift content, and remain independent of content scrolling.
  The banner must work on mobile, announce politely
  without moving focus, and clean up its timer when unmounted. Reuse an existing
  shared asset if suitable; otherwise export NotificationBanner from shared UI.

## Permissions and implementation

- Migration updates email-addressed storage, existing data, constraints/indexes,
  invitation RLS and invite/list/respond/manage RPCs together. No direct client
  mutation grants. Preserve organisation-admin authorization, explicit grants,
  empty search_path, organisation scoping and invitation attempt limits. Use
  structured outcomes for expected validation so quota increments are committed
  rather than rolled back by exceptions.
- Derive recipient ownership from the authenticated user's current verified
  email in server-controlled Auth data; never from a client parameter, JWT email
  hint or editable profile metadata. Recheck under the shared organisation lock
  when accepting/cancelling. Unknown email grants no access by itself.
- Preserve already-linked invitations safely through migration and avoid binding
  an invitation to an unrelated account. Account deletion/email changes must not
  expose another recipient's invitations. Deduplicate canonical pending addresses
  during migration without creating duplicate membership or losing accepted state.
- Keep current 100-entry bound; no new history page, mail transport, automated
  acceptance or privileged invite links. Admins may see whether the target is
  already a member; no account-existence claim is made by the UI.

## Proposed testing interfaces

Use existing SQL RPC integration tests for unknown-email persistence, later
registration/verification and acceptance, case-insensitive matching, duplicates,
expiry/resend/decline/cancel, already-member errors, limits, organisation isolation,
unverified/wrong recipients, email changes and accept/cancel concurrency. Verify
the migration and existing invitation tests against disposable local Supabase.

Use existing HTTP tests for truthful success/duplicate/error responses. Use
Playwright for unknown-email outgoing rows, right-aligned cancellation, existing
recipient acceptance, creation/withdrawal text, three-second banner removal/retrigger,
overlay placement without layout shifts, keyboard/focus and
mobile layout. Tests cross public RPC/HTTP/rendered UI seams; no private-state
test interfaces. Run npm run verify and relevant integration/browser suites.

Main agent implements with local tdd and codebase-design skills. Separate security
preflight/post-change and one independent code/UI review. Update user/developer
guides and the existing session log with actual results and limitations.
