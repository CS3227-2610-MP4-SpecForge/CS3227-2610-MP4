# Organisation membership slice

Status: implemented and independently code/security reviewed for local use.
Authorised by the user's explicit request to implement the next slice
of the approved product MVP. No new product scope or test seam is introduced.

Admins invite existing accounts by case-insensitive registered email; invitations
are in-app, grant ordinary membership only, and expire after seven days. The
recipient accepts/declines; admins list/cancel pending invitations and resend
expired ones. A completed invitation cannot be replayed; re-inviting a former
member creates a fresh invitation. Duplicate pending invitations and invitations
to current members do not create extra access. Unknown-email attempts return a
generic outcome, with no browsable directory. Verification is required to use
membership interfaces. Invitation identity is bound to the account at creation.

Admins view members, remove, promote or demote; members leave. Account roles
remain fixed. Serialised per-organisation mutations recheck actor permissions
and preserve at least one admin under competing requests. Lost membership
removes organisation access immediately. Destructive UI actions ask confirmation.

Public test seams approved in the product spec: same-origin authenticated HTTP,
session-bound Supabase RPC/RLS (including concurrent requests), and browser
membership journeys using disposable local accounts. Implementation interfaces:
GET /api/invitations; POST /api/invitations/[id] {action: accept|decline};
GET /api/organisations/[id]/members; GET/POST .../invitations (POST {email});
POST .../invitations/[invitationId] {action: cancel|resend};
POST .../members/[userId] {action: remove|promote|demote|leave}.
Database functions own authorization, expiry, atomic transitions and last-admin
protection; HTTP owns bounded inputs, origin/session checks and safe failures.
Lists are capped at 100 for current peer-testing scale; invitation creation and
resend share a database-enforced 20-attempt/hour/organisation bound. Unknown
addresses consume this bound too. Hosted abuse tuning remains a release gate.

Excludes email delivery/notifications, demo kits, account deletion, request/AI
features, deployment and setup changes. Existing uncommitted work is preserved.
