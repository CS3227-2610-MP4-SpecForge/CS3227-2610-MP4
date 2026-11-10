# Direct organisation navigation

Status: approved by the user on 2026-11-10.

## Problem and behavior

Organisation cards currently select a team and show an Active organisation panel
with a second View requests link. Selecting a card should instead open
`/organisations/{id}/requests` immediately for both PM and Developer accounts.

- Render the organisation name/card as a semantic navigation link, retaining its
  name, Admin/Member label and shared visual styling. Support keyboard activation
  and normal browser link actions.
- Remove the Active organisation panel, access sentence and View requests step.
- Preserve membership management with a separate Manage button beside each card,
  outside the navigation link. It selects the organisation for the existing
  membership section without navigating. Give the button an accessible name
  identifying its organisation, and make the selected management context clear.
- Keep organisation creation on the workspace with its existing success notice
  and management selection; remove the obsolete panel from this path too.
- Keep invitations, workspace loading/error/empty states and membership refresh
  behavior. Use the existing destination's loading and access-denied handling if
  membership changes after the organisation list loads.

## Scope and implementation

Update `src/components/workspace.tsx` and relevant shared styles. Retain selected
organisation state only for membership management. Reuse the existing Membership
module and server authorization; no new route, endpoint, permission or database
change. No new abstraction is needed for this navigation change.

Update `docs/UserGuide.md` to describe direct navigation and the separate Manage
action. Main agent implements with local tdd/codebase-design skills after approval;
one independent read-only code/UI review at completion. Security-specialist review
is only needed if implementation expands into authorization or other sensitive work.

## Acceptance criteria and proposed testing interface

Use existing Playwright browser tests and local fixtures as the public behavior
test interface; no implementation-state assertions or new unit-test seam.

- Clicking a card opens that organisation's requests URL in one action; cover PM
  and Developer accounts and keyboard Enter activation.
- The workspace has no Active organisation panel or View requests link, including
  after creation and Manage selection.
- Manage keeps the user on the workspace and exposes controls for the correct
  organisation; selecting another organisation updates that context. Preserve
  invitation, promotion/demotion, removal and leave regression coverage.
- Update accounts, requests and membership browser tests that use the old button
  or access sentence. Check mobile layout, visible focus and accessible names.
- Check existing destination access denial for stale/revoked membership without
  changing its enforcement.

Start with an expected failing navigation regression, then implement and run the
focused browser tests. Run `npm run verify` and available required browser checks;
record unavailable checks honestly. Update one sanitized session log with actual
results and review findings.

## Approved follow-up: management overlay

User requested Manage open an overlay roughly 70% of viewport width and height.
Use a native modal dialog with internal scrolling, Close and Escape dismissal,
keyboard focus containment/restoration, shared theme tokens and a wider fit on
small screens. Keep incoming invitations on the workspace; management controls
live in the dialog. Creation continues to open management. Close automatically
when refreshed membership no longer includes the organisation. Extend the agreed
Playwright seam to assert dialog visibility, dimensions, dismissal and focus,
and preserve membership flows. No authorization or data changes.

## Approved follow-up: frozen modal header

User requested a persistent header bar with an X icon at top right instead of
the Close text button. Keep the accessible Close management name, Escape and
focus behavior. Put management content in a separately scrollable region so the
header stays visible at desktop/mobile sizes. Verify through existing Playwright
seam that content scrolls while the X stays in place and dismisses the modal.

## Approved follow-up: simplified member management

User requested a thinner header with unboxed X, no modal Membership/Refresh
heading or outer Manage card. Admin view has a light-purple Invite Member panel
(email/send row plus outgoing invitations), then Existing members. Each member
row displays username, Admin pill only when admin, smaller application role,
and right-aligned Promote admin/Demote admin action. Preserve Remove member,
Leave organisation, confirmations and last-admin protections. Sort admins first,
then username alphabetically in each group, before existing 100-member limit.
Add username to list_members without widening admin-only access or grants.
Non-admin management keeps existing leave-only permissions. Reopen modal to
refresh remote changes; keep inbox refresh outside modal. Existing browser seam
covers layout/actions/order and SQL RPC tests cover username data, ordering and
admin-only organisation isolation. These extend the approved testing interfaces.

## Approved follow-up: neutral initial modal focus

User requested the X not be selected/highlighted when Manage opens the modal.
Move initial programmatic focus to the named static management content region,
without a focus outline on that region. Retain visible keyboard focus on controls,
native focus containment, Escape dismissal and focus restoration. Extend the
existing Playwright modal test to verify neutral initial focus and keyboard access
to the X. This is an approved correction to the existing modal behavior.
