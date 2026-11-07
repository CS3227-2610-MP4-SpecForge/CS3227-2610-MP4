# Manual request lifecycle

Approved amendment: [two-field AI workspace](2026-11-07-two-field-ai-workspace.md)
supersedes the six-field editor/validation shape and adds private chat with
explicit proposal application. The earlier details below retain their history.

Status: approved by the user on 2026-11-07; implemented and independently
code/security reviewed for local use. Implements the next slice
of the approved product MVP; AI clarification/conversations follow separately.

## Behaviour

A verified PM member can create a private draft in the selected organisation,
edit its six plain-text fields, autosave and resume it. Fields are title, problem
and intended user, desired behaviour, acceptance criteria, out of scope, and
assumptions/unresolved questions. Empty fields are permitted while drafting.
The author can delete an unsubmitted draft after confirmation.

Submission is explicit: all six fields need trimmed content (`None` is valid),
and the PM must acknowledge the assumptions/unresolved-questions field. Submission
makes the request visible to every current member. Only its original PM author
can edit it, using explicit Save changes with the same validation and fresh
acknowledgement. Published editing never autosaves. Readers see the last saved
version, author identity, submission time and last-modified time. Submitted
requests cannot be deleted or reverted to drafts.

Drafts remain author-private even from admins. Developers (including admins)
cannot create/edit PM requests. Membership loss removes all access, while stored
requests persist; rejoining restores author access. Submitted requests remain
visible to members after the author leaves. Author display uses a stable account
ID; no new account directory or email visibility is introduced.

## Save and conflict handling

Debounce draft autosave by 750ms and serialize saves within an editor. Show
unsaved, saving, saved and failed states accurately; offer explicit retry after
failure, with no automatic retry loop. Preserve text in the open editor on error.
Warn before navigating away with unsaved text. A failed/timed-out mutation must
be reconciled by loading the current saved revision before a manual retry.

Use a database revision number for conditional writes. Concurrent/stale writes
return conflict rather than overwrite newer content. Preserve the local text and
require explicit reload/discard before continuing after conflict. Submission
uses the current revision and cannot race with an in-flight draft autosave.

Approved local input limits: title 1–160 characters on submission (0–160 in a
draft); other fields 0–4,000 characters, nonempty on submission. Request mutation
JSON is capped at64 KiB; existing account/membership endpoints retain8 KiB.
These are application storage limits, not claims about SoC provider limits.
Lists return at most100 entries for the existing peer-testing scale.

## Module and approved test seams

One request module owns HTTP validation and safe results; PostgreSQL owns
verified membership, fixed PM role, authorship, privacy and atomic revision/state
transitions. Use the existing session-bound Supabase adapter and shared UI/theme.
No service-role credentials in normal app paths. All mutations retain configured
Origin checks and authenticated responses remain private/no-store.

Concrete HTTP interface under /api/organisations/[orgId]/requests:
GET lists submitted requests plus the caller's own drafts; POST creates an empty
draft using a client-generated UUID idempotency key scoped to the authenticated
author and organisation. Retrying the same creation key returns its existing
request without changing it; retain the key in memory across ambiguous failures.
GET /[requestId] reads an authorised request. POST /[requestId] accepts
one strict action: save_draft, submit, save_published or delete_draft, with an
expected revision and only the fields relevant to that action. Organisation and
author identities derive from authorised context, never writable input.

Tests use the product-approved HTTP, real local Supabase RPC/RLS and browser
seams: draft create/autosave/resume/delete; validation/acknowledgement; explicit
publish/edit and last-saved visibility; cross-organisation ID substitution;
other PM/Developer/admin denial; membership loss/rejoin; concurrent writes and
save/submit races; transport failure/conflict text preservation; keyboard/mobile
and shared-state checks. Routine checks use disposable local accounts only.

## Exclusions and completion

No AI/provider calls, conversations, demo provisioning, deployment, comments,
revision-history UI, request assignment or partner-owned Developer AI. No new
hosting decisions. Run security preflight before implementation, main-agent
TDD/codebase-design, then independent code/architecture and security reviews.
Update guides and one sanitized session summary with actual checks/limitations.

## Security preflight

Independent preflight completed before implementation. Require storage-enforced
privacy/role checks and no direct client writes; acquire the existing organisation
lock before rechecking write permissions, then lock the request; atomically check
revision/state and validate published fields/acknowledgement; preserve author
identity through membership changes; render plain text; never persist draft text
in browser storage or logs. Test mutation/removal ordering, create-response-loss
idempotency and ambiguous save outcomes alongside the cases above. The session summary records the implemented controls, actual test evidence and
review findings; hosted release and the wider MVP remain incomplete.
