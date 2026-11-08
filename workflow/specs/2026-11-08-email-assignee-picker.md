# Email assignee picker

Status: approved by the user on 2026-11-08.

Replace the ticket's expandable account-ID checklist with a single bordered,
editable assignee box. Keep the existing maximum of five assignees and existing
author-only editing, draft autosave, and published Update behavior.

## Behavior and acceptance

- Clicking the box focuses an email search input. Typing performs debounced,
  case-insensitive substring search over current organisation members' emails.
- Matching emails appear in a bounded, scrollable suggestion list. Support
  mouse selection, Arrow Up/Down, Enter, Escape, and normal Tab navigation.
  Selecting an existing member adds their email as a removable chip and clears
  the query. Prevent duplicates and additions beyond five.
- Remove the Assign me button. The current user is searchable by email like
  every other member. Typing an arbitrary email does not invite or create users.
- Selected emails stay visible when the query changes and after reload, including
  when those members are outside the first suggestion page. Resolve selected
  identities through a bounded organisation-scoped lookup, never a global one.
- Show loading, no matches, lookup failure/retry, and five-assignee limit states.
  Ignore stale search responses. Closing the list preserves selected assignees.
- Use shared theme tokens, accessible combobox/listbox semantics, visible focus,
  and a responsive box/list that fits narrow screens.

## Permissions and data

Keep UUIDs in saved assignments. Extend the session-authorized member lookup to
return only user ID, email, and existing app role for current members of the
requested organisation. Reject outsiders, anonymous callers, overlong queries,
and unbounded selected-ID lookups. Preserve private/no-store HTTP responses.
Do not expose a global email directory, Auth metadata, or credentials.

## Scope and test interfaces

The picker owns searching, pagination, selected-email resolution, and keyboard
interaction behind its existing selected-ID/onChange interface. Add an additive
database migration and validate the returned member shape at the HTTP interface.
No usernames, display-name profiles, invitations, or changes to assignment/save
permissions. Broader ticket-list author/activity identity presentation is outside
this change.

Approved test seams:

- Browser ticket editor: email search/select/remove/self-assignment, keyboard
  interaction, five-person limit, stale/error/empty states, saved selection
  restoration, and narrow-screen layout; catches observable picker/save behavior.
- Local database RPC and authenticated HTTP member lookup: case-insensitive email
  matching, pagination/selected lookup, bounded validation, and organisation
  isolation; catches data access and response-contract regressions, not UI layout.

Run focused red/green checks, repository verification and local integration/browser
checks. Obtain independent security preflight/post-change and code review.

## Follow-up: assignee count beside the label

Show the live selection count as `(x/5)` beside the editable Assignees label.
Remove the help line below the picker and keep the count associated with the
combobox as its accessible description. The email placeholder and five-person
limit remain. Verify the count at zero, after selecting and removing people,
and at the limit in the existing picker browser journeys.
