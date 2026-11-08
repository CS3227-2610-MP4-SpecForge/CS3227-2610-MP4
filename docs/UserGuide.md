# SpecForge User Guide

## Current features

This version supports email/password signup, email-code verification, login,
logout, creating/listing/selecting your organisations, invitations and membership
management, ticket drafting/publication, delivery tracking and team comments. Both Product Managers and
Developers use the same workspace. Organisation creators become admins.

Demo kits and the partner-owned Developer AI remain future work. PM task chat
uses SoC LLM; hosted deployment is not configured.
No public application URL is available yet.

## Try the local app

Follow the [developer setup](DeveloperGuide.md#local-setup), then open
<http://localhost:3000>. Use disposable test information, not production data.

1. Choose **Create an account**. Enter an email, a password of 12–128 characters
   and either **Product Manager** or **Developer**. Your application role is fixed.
2. Choose **Enter your verification code** after signup. For local testing, open
   <http://127.0.0.1:55324> and find the email addressed to your disposable account.
   Enter its eight-digit code and email on the verification screen. This local
   inbox captures messages; it does not send email to real inboxes.
3. Successful verification opens **Organisations**. You cannot create an
   organisation before verification. Use **Send a new code** if needed; resend
   and sign-in attempts are rate-limited. Local codes expire after one hour and
   cannot be reused after verification.
4. Enter a name of 1–80 characters and choose **Create organisation**. You become
   its first admin. Either application role can create multiple organisations.
5. Select an organisation card to make it active. Only organisations you belong
   to appear. This version's selection lasts until the page reloads.
6. Choose **Sign out**, then use the ordinary email/password sign-in form to
   return. Other members' organisations are not discoverable through your account.

Password recovery and account deletion are not available. Save your test
credentials; a new account will not inherit the previous account's memberships.
Admin status does not change your PM/Developer application role.

## Invitations and membership

Select an organisation to manage it. Admins can use **Invite by registered
email** for an existing account. The invitation appears under **Your invitations**
in that account's workspace; no invitation email is sent. Addresses are matched
without case sensitivity. Sending shows a generic result; check outgoing
invitations to see eligible recipients. There is no account directory.

Recipients must verify their account, then choose **Accept** or **Decline**.
Accepting grants ordinary membership, never admin access. Invitations expire
seven days after creation/resend. Admins can cancel pending invitations or
**Resend** expired ones. Completed invitations cannot be reused.

Admins see members and their fixed application roles. Use **Promote to admin**,
**Demote admin** or **Remove member** after confirming. Members can **Leave
organisation**. The last admin must promote someone else before leaving, being
removed or being demoted. Admin access does not change application roles.

Removal/leaving immediately ends access. Rejoining requires a fresh invitation.
Use **Refresh membership** to pick up changes made in another browser; server
permissions always use current membership. Invitations and member lists currently
display at most 100 entries. New invitations and resends share a limit of 20
attempts per hour per organisation, including unknown addresses and duplicates.

## Ticket delivery and team discussion

A purple visibility banner runs along the top edge of the ticket panel, above
the title. **Back to requests** has a left-arrow icon. A lock with **This task is
private and unpublished** means only its author can read it. After publication,
an eye with **This task is visible to members of the [organisation name]
organisation** describes the saved ticket's audience. Unsaved published edits
keep this banner because members still see the last saved version.

The title appears once at the top of the ticket. Delivery fields sit beneath
it, followed by Description and team discussion/activity. Use **Copy ticket
link** to share the page. Links still require current organisation membership;
drafts remain private even when someone is assigned. **About this ticket**, at the bottom of the ticket panel below Publish/Update,
expands the author and saved timestamps. Reader views show it below Refresh saved
request, before team discussion.

Beneath the title, the author sets a date-only **Due date**, **Priority**
(Low, Medium, High or Urgent), and zero to five assignees. Open **Assignees** to
search current members by account ID or role. Either PMs or Developers can be
assigned; no email directory is exposed. All draft fields autosave privately.
**Publish** publishes the whole ticket, including delivery details. Due date is optional and can be cleared after
publication. After publication, **Update** saves text and delivery edits together. Existing published tickets without a deadline remain unscheduled
until their author sets one. A departed member is unassigned automatically;
rejoining does not restore old assignments.

Drafts show a disabled **To do** delivery status. This describes progress; the
visibility banner describes who can read the ticket. Published tickets have a
**Delivery status**: To do, In progress, In review, Done
or Cancelled. The author and current assignees can change it, including reopening
completed work. Only the author changes scheduling, priority and assignments.
Other members can read and comment. Draft/publication state remains separate from
delivery status. Overdue and due-today indicators use your browser's local date;
Done and Cancelled tickets are excluded from overdue work.

The request list supports title search, status, priority and assignee
filters, including **Assigned to me**, **Unassigned** and **Overdue only**. Choose
recently updated or due-date sorting, then **Apply filters**. Filters run across
all visible tickets; **Load more tickets** fetches another page. Refresh after
teammates make changes; pages are a live list, not a frozen snapshot.

**Team discussion & activity** is shared with current organisation members on
published tickets. Post plain-text comments up to 4,000 Unicode characters;
comments cannot be edited or deleted. Each member can post 20 comments per minute
per organisation. A lost response preserves your comment and offers **Retry
comment**, which safely repeats the same attempt. Check activity before starting
a new attempt. **Load older activity** reads another 50 entries.

Activity records publication, requirements edits and delivery changes with actor
and time. It does not include old description text, private draft changes or AI
conversations. Existing changes from before this feature have no backfilled
activity. On a save conflict, your local input remains visible. Authors can use
**Reload saved version and discard edits**; assigned readers can use **Reload
delivery details**. These recovery controls appear only when needed.

## Tasks and AI chat

Select an organisation and choose **View requests**. PM authors can create/edit
private drafts; current members read submitted tasks. There are two task fields:
**Title** (up to160 Unicode characters) and **Description** (up to24,000).
Description is free-form Markdown; headings are optional. Existing requests keep
their title and all old section contents under description headings.

New drafts show editable **Title** and **Description** immediately. Write
directly, or use **What needs to change?** in the right AI panel and choose
**Draft ticket**. **Start manually** dismisses the starter and focuses Title;
typing a title also switches to manual writing. Rough ideas autosave privately. A fresh AI draft fills the editor and
has **Undo AI draft** during the current editing session while its generated
content is unchanged. AI never publishes
for you; failed, stale or recovered generations require review instead.

The ticket occupies the main workspace. The right AI panel starts open and
contains drafting tools, private discussion, suggestions and undo. Use **Hide AI
assistant** or **Show AI assistant** to collapse or reopen it; on phones it
appears beneath the ticket. Collapsing keeps your conversation, typed instruction
and pending suggestion. Chat is private to the original PM
author, including from admins and after publication.

Use **Improve clarity**, **Add acceptance criteria**, or **Find missing details**
for focused help. Acceptance suggestions preserve your title and other sections;
unrecognized/ambiguous section structures may need manual editing. Finding missing
details asks questions without modifying the ticket. Answer using the single
**AI instruction or question** box and **Ask AI**, or choose **Leave undecided** to
ask AI to record an open question rather than assume its answer. Useful answer
options may appear as chat text; they are not separate selection controls.

SoC writing remains experimental: a valid response can add unsupported requirements,
omit supplied details, or contradict an unresolved question. Check the entire draft
and every suggestion before accepting or publishing. If a writing action returns
only discussion, no ticket changes are available to review; continue manually or
send a more specific instruction. Invalid responses preserve your existing work.

A complete title/description suggestion can still be reviewed if SoC omits its
accompanying message; the app displays “Review these suggested ticket changes.”
Extra response fields are ignored. Incomplete ticket suggestions still fail safely
rather than replacing either field with partial content.

AI edits appear as **Suggested ticket changes** in the AI panel, with removed/added
text. Choose **Accept changes** or **Discard**. Conversational proposals have a
**Review ticket changes** action to open the same review. Acceptance replaces the
reviewed fields locally. Editing during generation or
another saved revision makes suggestions outdated; your writing is preserved.
Recovered or historical AI drafts never automatically replace the editor.

All draft fields autosave750ms after a pause. Accepting AI changes in a draft
follows that same autosave. **Publish** requires a nonempty title/description and publishes all ticket
fields together. Due date and assignees are optional. Published
edits, including delivery details and accepted AI changes, remain local until
**Update**. Readers see only the last saved ticket. If required fields are missing, clicking
**Publish** focuses the missing field and shows validation.
Only the original PM author can edit ticket requirements; assigned Developers can update delivery status. Admin status grants no additional ticket-editing rights.

**Delete draft** asks confirmation; submitted tasks cannot be deleted. Leaving
or removal ends access; submitted work remains visible to members and rejoining
restores author access. Dates and stable author-account IDs remain visible.

On ticket save failure, local text and delivery edits are preserved and automatic saving stops. Use
**Check saved version** before retrying, or explicitly reload/discard after a
conflict. New-draft retries use the same creation key to avoid duplicates.

On chat failure, your admitted message and previous conversation remain saved.
Use **Refresh chat** after a lost response. A completed send is not duplicated;
an absent send can be explicitly retried, using the current task if it changed.
Failed turns have **Retry AI turn**; changed task snapshots need a new message.
Failure notices distinguish:

- **Invalid AI output:** new failures explain whether the response was cut short,
  was not valid JSON, had the wrong ticket structure, or could not be safely used.
  Earlier failures keep the generic message because their exact reason was not
  recorded. JSON response mode improves formatting; ticket validation remains.

- **Local deadline:** SpecForge stopped waiting at its60-second provider deadline;
  SoC may still be processing. No upstream status is inferred.
- **Upstream HTTP error:** SoC returned an actual status such as502,504 or429;
  the notice includes that status and app-observed elapsed time. A502 alone
  does not prove the upstream cause was a timeout.
- **Network failure:** the connection or response stream failed without an
  upstream HTTP error response.
- **Browser waiting limit:** the browser's75-second wait expired; refresh chat
  to reconcile rather than assuming the server/provider failed.

Provider failure details survive chat reloads. Older failed turns retain a generic
notice because no detailed status/timing was recorded. Elapsed time measures
what this app observed, not SoC's internal processing duration.

There are no automatic provider retries or fallback models. Manual editing
remains available when AI fails. Unsaved task text warns before departure and
is not stored in browser persistent storage.

App limits (not SoC quotas): one active AI turn per request/account,20attempts
per account/hour,4,000-character messages,60-second provider deadline and
2,000output tokens per response (debugging policy; no separate AI reply character ceiling). The full serialized task/conversation/system
context is capped at48,000UTF-8bytes; older messages are never silently removed.
When context or conversation storage is full, continue editing manually. Chat
storage is bounded to1MiB, reserving completion space before admission. Long or
truncated AI responses fail safely; ask for a concise proposal or edit manually.

Markdown display supports headings, lists, paragraphs and fenced code. Raw HTML,
images and links remain literal text; they do not execute or fetch remote media.
Ticket lists use 50-item pages with **Load more tickets**. No hosted application URL is available yet.

## Failures

- Invalid credentials or an unverified email: check your details or verify email.
- Invalid/expired code: request a new code and use the most recent email.
- Too many attempts: wait before retrying; repeated submissions do not help.
- Connection/service failure: retry explicitly. Do not assume a failed or timed-out
  organisation creation did not commit; reload the list before creating again.
- Invitation/member change unavailable: refresh membership; the invitation may
  have expired or changed, permissions may have changed, or the last-admin rule
  may block the action. Do not repeatedly submit a timed-out change; refresh first.
- Workspace loading failure: use **Retry loading workspace**. Signed-out users
  are redirected to sign-in.

Online ordinary signup will require configured SMTP delivery. Planned generated
demo accounts will bypass email delivery, but are not provisioned in this slice.
