# Account usernames

Status: approved by the user on 2026-11-09.

## Supabase support

Supabase Auth accepts custom signup metadata and lets users edit it after
signup. Auth has no native unique username field. Use `options.data.username`
to pass the chosen name to the existing profile-creation trigger and store the
canonical name in `public.profiles.username`. PostgreSQL's built-in `NOT NULL`
and `UNIQUE` constraints enforce requiredness and global uniqueness, including
concurrent signups. Supabase's optional Before User Created hook supports custom
rejections and could improve conflict feedback if local Auth tests show a need.
The database constraint remains authoritative.

[Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data),
[Supabase Auth user fields](https://supabase.com/docs/guides/auth/users),
[Before User Created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook),
[PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).

## Signup and existing accounts

- Require a chosen username on the shared signup form for both Product Managers
  and Developers. Accept 3–24 ASCII letters, digits, or underscores, with no
  spaces. Store and display lowercase, so `Atlas_PM` and `atlas_pm` compete for
  the same name across roles and organisations. Reserve the `legacy_` prefix.
- Validate in the form and the signup HTTP handler. Copy the chosen name once
  into the protected profile in the existing Auth account-creation transaction.
  Require a valid name at the database boundary, including direct Supabase Auth
  signup, and enforce a global unique constraint. Concurrent attempts for the
  same name create at most one account and profile. The name is reserved as soon
  as the account is created, including while email verification is pending.
- A failed signup keeps the entered username editable and gives actionable
  guidance. SpecForge uses the same response for an ambiguous Auth provisioning
  failure and a signup accepted for processing. This preserves the app route's
  protection against revealing whether an email is registered and advises trying
  another username if no code arrives. Keep signup rate limits. The raw Supabase
  signup route can expose different statuses because it only provisions a
  profile for a new Auth account. Never return the username owner's information
  or database error details from the app route.
- Assign each existing profile a unique generated username in the reserved
  namespace, independent of its email and UUID. Preserve account access and
  all existing data. This slice includes no username changes after signup,
  username login, or public username lookup. Changes to Auth metadata cannot
  change the username on a protected profile.

## Username display

- Show usernames in every UI label currently displaying an account UUID. This
  includes ticket-list authors and assignees, assignee filter options, ticket
  detail authors, activity and comment authors, and assignment changes in
  activity history. Keep existing email labels and email search where already
  used, including the assignee picker and organisation invitations.
- Preserve account UUIDs for storage, authorization, form values, and existing
  route and action inputs. Extend existing authenticated account, ticket,
  ticket-member and activity read interfaces with the labels needed for their
  responses. Resolve historical labels from the authorized records, even when
  the referenced person has left the organisation. Use `Former account` for a
  deleted identity and `System` for an event with no actor. Never use the UUID
  as a display fallback.
- Keep own-profile RLS and existing ticket visibility, verified-email and
  organisation checks. Identity labels can be read only through existing
  permissions for the account, member list, ticket, or activity record. Keep
  reads bounded by existing pages and assignment limits.

## Approved test interfaces

- Signup HTTP and local Supabase Auth/profile integration cover both roles,
  missing/invalid input, case-insensitive duplicates and concurrent requests,
  failed-account rollback, unchanged email verification, and metadata tampering.
  An isolated additive migration check covers existing accounts and data.
- Existing authenticated ticket/member/activity HTTP and session RPC interfaces
  cover labels for visible rows, departed/deleted actors, historical assignee
  changes, and denial to outsiders and readers of another user's private draft.
- Playwright journeys cover the required field for both roles and username
  rendering on ticket list, detail, filters and activity. Verify accessible
  field/error behavior and narrow-screen signup using the shared form controls.

Use focused red/green checks and the repository suite, then obtain independent
code and security reviews. Update the user and developer guides after implementation.

## Signup form polish

Place Username before Email address and Password. Keep format and password
length hints, and shorten the role hint to explain that the role is fixed.
Keep the reserved prefix enforced and ask the user to choose a different name
if they enter it. Use the shared role dropdown with purple and blue pills and
verify keyboard selection for both roles in the existing signup journeys.
