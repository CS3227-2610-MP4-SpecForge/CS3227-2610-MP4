# SpecForge User Guide

## Current features

This version supports email/password signup, email-code verification, login,
logout, creating/listing/selecting your organisations, invitations and membership
management, ticket drafting/publication, delivery tracking and team comments. Both Product Managers and
Developers use the same workspace. Organisation creators become admins.

Each role has its own AI feature, both on SoC LLM. Product Managers get private
ticket drafting, inline suggestions and discussion. Developers get generated test
plans on published tickets ([below](#test-plans-developer-ai)).

Demo kits remain future work.

There is no public application URL yet, so testing is local for now. The
deployment pipeline exists (see
[Deployment](DeveloperGuide.md#deployment-and-environments)) but awaits hosting
setup, and this guide and the product website will carry the URL once a
deployment has actually run.

## Try the local app

Follow the [developer setup](DeveloperGuide.md#local-setup), then open
<http://localhost:3000>. Use disposable test information, not production data.

1. Choose **Create an account**. Enter a username, an email address, and a
   password of 12–128 characters. Select **Product Manager** or **Developer**
   from the **Application role** dropdown. Usernames
   use 3–24 letters, digits, or underscores and are stored in lowercase. Each
   username is unique across SpecForge. If no verification code arrives, try a
   different username or sign in if you already have an account. Your username
   can be changed from your profile; your application role is fixed after signup. Accounts created before this
   change have a generated username beginning with `legacy_`.
2. Choose **Enter your verification code** after signup. For local testing, open
   <http://127.0.0.1:55324> and find the email addressed to your disposable account.
   Enter its eight-digit code and email on the verification screen. This local
   inbox captures messages; it does not send email to real inboxes.
3. Successful verification opens **Organisations**. Select **SpecForge** in the
   navbar to return to this page from elsewhere. You cannot create an
   organisation before verification. Use **Send a new code** if needed; resend
   and sign-in attempts are rate-limited. Local codes expire after one hour and
   cannot be reused after verification.
4. Enter a name of 1–80 characters and choose **Create organisation**. You become
   its first admin. Either application role can create multiple organisations.
5. Select an organisation card to open its requests page. Only organisations you belong
   to appear. This version's selection lasts until the page reloads.
6. Hover over your username and email in the navbar (or select them by click or
   keyboard), then choose **Sign out**. If a ticket has unsaved work, cancel the
   departure warning to keep editing or confirm to leave. Use the ordinary
   email/password sign-in form to return. Other members' organisations are not discoverable through your account.

Password recovery and account deletion are not available. Save your test
credentials; a new account will not inherit the previous account's memberships.
Admin status does not change your PM/Developer application role.

## Your profile

Open the navbar account dropdown and choose **Profile**, above **Sign out**.
Your profile shows your username, application role, verified email address and
actual account creation date, plus your organisations and Admin/Member status.
The initial avatar is generated from your username.

To change your username, edit **Username** and choose **Save changes**. Names
follow the same rules as signup and must be unique. **Cancel** restores the saved
name. A successful change updates the navbar immediately and your current name
appears on existing tickets and team labels; ticket ownership stays with your
account. Previous names are not reserved. Email and role are read-only.

If saving fails, your typed name stays available for retry. Leaving with unsaved
changes, including signing out, asks for confirmation. A profile loading failure
has a **Retry loading profile** action.

## Invitations and membership

The management overlay groups invitation controls in a light-purple **Invite Member** panel. **Existing members** lists usernames with an Admin pill where applicable and their application role underneath. Admins appear first; each group is sorted alphabetically by username. Promote/demote controls appear beside each member.

Choose **Manage** beside an organisation to open its management overlay. Close it
with the **X** in the fixed header or Escape. The header stays visible while the
management content scrolls. Admins use **Invite by email** for any email address,
including one that has not registered. The invitation immediately appears in
**Outgoing invitations**. No invitation email is sent.

After registering and verifying that email, the recipient finds the invitation
under **Your invitations** in their workspace and can **Accept** or **Decline**.
Email matching ignores case and surrounding spaces. Accepting grants ordinary
membership, never admin access. Invitations expire seven days after creation or
resend. Duplicate sends reuse the outstanding invite without extending expiry;
use **Resend** on an expired invite. Existing members cannot be invited again.

Outgoing invitations include pending, expired and declined entries. Use **Cancel
invitation** on the right of the row to withdraw any unaccepted invite. Accepted
and cancelled entries disappear; accepted membership cannot be cancelled through
an invitation. Declined recipients need a fresh invitation to try again.

Creation shows **Invitation created.** and cancellation shows **The invitation has
been withdrawn** in a top-centre overlay for three seconds. These banners float
above the modal without moving content. Duplicate sends show **Invitation already
pending.** Failures stay visible so they can be addressed.

Admins see members and their fixed application roles. Use **Promote admin**,
**Demote admin** or **Remove member** after confirming. Members can **Leave
organisation**. The last admin must promote someone else before leaving, being
removed or being demoted. Admin access does not change application roles.

Removal/leaving immediately ends access. Rejoining requires a fresh invitation.
Close and reopen **Manage** to pick up management changes made in another browser; use **Refresh membership** in the workspace for incoming invitations; server
permissions always use current membership. Invitations and member lists currently
display at most 100 entries. New invitations and resends share a limit of 20
attempts per hour per organisation, including unknown addresses and duplicates.

## Ticket delivery and team discussion

A purple visibility banner runs along the top edge of the ticket panel, above
the title. **Back to requests**, **Back to workspace**, and **Back to sign in**
share a left-arrow icon. A lock with **This task is
private and unpublished** means only its author can read it. After publication,
an eye with **This task is visible to members of the [organisation name]
organisation** describes the saved ticket's audience. Unsaved published edits
keep this banner because members still see the last saved version.

The title appears once at the top of the ticket. Delivery fields sit beneath
it, followed by Description and team discussion/activity. Use **Copy ticket
link** to share the page. Links still require current organisation membership;
drafts remain private even when someone is assigned. **About this ticket** is
always visible below **Publish** or **Update**. It shows the author and ticket
timestamps, followed by the author's save status. Drafts show **Last autosaved**
after their next autosave. Older drafts with no recorded autosave time and
published tickets show **Last saved**. Readers see the details below
**Refresh saved request**, before team discussion.

Beneath the title, the author sets a date-only **Due date**, **Priority**
(Low, Medium or High), and zero to five assignees. The **Assignees** label shows
the current count, such as **(2/5)**. Click the box and start typing an email.
Matching current organisation members appear in a
scrollable list; click a suggestion or use the arrow keys and Enter to select it.
Use Escape to close suggestions and the × beside an email to remove it. Either
PMs or Developers can be assigned. Search your own email to assign yourself. All draft fields autosave privately.
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

The Requests table shows **Title**, **Owner**, **Assignees**, **Status** and
**Priority**. Select a title to open the ticket. On narrow screens, scroll the
table sideways to see all columns.

Select a status or priority dropdown in the table to save that change immediately.
The owner can change priority, including on private drafts. The owner and
current assignees can change status on published tasks. The table refreshes the
applied filters after an edit, so the task may move or leave the results.

Search by title or use the status, priority and assignee dropdowns, including
**Assigned to me** and **Unassigned**. Sort by **Recently updated**, **Due date**
or **Status**, then select the search icon or **Apply filters**. Status sorts
private drafts first, then To do, In progress, In review, Cancelled and Done.
Filters and sorting run across all visible tickets. **Load more tickets**
fetches another page. Reload the page for a fresh default view, or select
**Apply filters** again to refresh your filtered results.

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

Select an organisation card to open its requests page. PMs select **New task**
to create a private draft. Current members can read published tasks. The two
task fields are **Title** (up to 160 Unicode characters) and **Description**
(up to 24,000).
Description is free-form Markdown; headings are optional. Existing requests keep
their title and all old section contents under description headings.
Use **Write** to edit the Markdown and **Preview** to see how the current text,
including unsaved edits, will appear to readers. Switch back to **Write** to
continue editing. You can publish or update from either tab.

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

Use the **AI instruction or question** box and **Ask AI** for questions and
suggested edits. Review suggestions before applying them. Choose **Leave undecided**
to ask AI to record an open question. Useful answer options may appear as chat text.

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
restores author access. Ticket lists and details show the author's username.
The Requests table, assignee filters and activity history also use usernames.
The ticket's assignee picker still searches by email.

On ticket save failure, local text and delivery edits are preserved and automatic saving stops. Use
**Check saved version** before retrying, or explicitly reload/discard after a
conflict. New-draft retries use the same creation key to avoid duplicates.

After a lost response, SpecForge checks the saved conversation automatically.
If the send reached the server, its turn appears in the conversation. If the
check finds no turn, you can resend using the current ticket. If the check
fails, reopen the AI assistant to try again. Failed turns offer **Retry AI
turn** when their ticket snapshot still matches.
Failure notices distinguish:

- **Invalid AI output:** new failures explain whether the response was cut short,
  was not valid JSON, had the wrong ticket structure, or could not be safely used.
  Earlier failures keep the generic message because their exact reason was not
  recorded. JSON response mode improves formatting; ticket validation remains.

- **Local deadline.** The notice reads “AI response timed out after 90 seconds.”
  Earlier timeouts show their recorded duration in whole seconds.
- **Upstream HTTP error:** SoC returned an actual status such as502,504 or429;
  the notice includes that status and app-observed elapsed time. A502 alone
  does not prove the upstream cause was a timeout.
- **Network failure:** the connection or response stream failed without an
  upstream HTTP error response.
- **Browser waiting limit.** If the browser's 110-second wait expires, SpecForge
  checks the turn's saved status.

Provider failure details survive chat reloads. Older failed turns retain a generic
notice because no detailed status/timing was recorded. Elapsed time measures
what this app observed, not SoC's internal processing duration.

There are no automatic provider retries or fallback models. Manual editing
remains available when AI fails. Unsaved task text warns before departure and
is not stored in browser persistent storage.

App limits (not SoC quotas): one active AI turn per request/account,20attempts
per account/hour,4,000-character messages,90-second provider deadline and
2,000output tokens per response (debugging policy; no separate AI reply character ceiling). The full serialized task/conversation/system
context is capped at48,000UTF-8bytes; older messages are never silently removed.
When context or conversation storage is full, continue editing manually. Chat
storage is bounded to1MiB, reserving completion space before admission. Long or
truncated AI responses fail safely; ask for a concise proposal or edit manually.

Markdown display supports headings, lists, paragraphs, `**bold text**`,
`*italic text*` or `_italic text_`, and fenced code. Raw HTML, images and links
are displayed as text.
Ticket lists use 50-item pages with **Load more tickets**. No hosted application URL is available yet.

## Test plans (Developer AI)

Sign in with an account whose role is **Developer** and open any **published**
ticket in an organisation you belong to. Below the ticket, select **Show test
plan**.

**Generating.** Optionally type a focus note (up to 500 characters), for example
"concentrate on the invitation expiry rules", then select **Generate test
cases**. The assistant reads only the ticket title and description and returns up
to 12 cases. Each case has a title, a kind pill (**Happy path** green, **Edge
case** yellow, **Failure** red), optional preconditions, numbered steps and one
expected result.

**Reviewing and saving.** Generated cases are a suggestion: nothing reaches the
ticket until you select **Save to ticket**. **Discard** removes them from your
view. Once saved, every member of the organisation sees the plan, together with
the username of the developer who saved it and when. Saving again shows
**Replace saved plan** and increases the version number.

**What you cannot do.** Product Managers see a saved plan read-only and have no
Generate button; the ticket author cannot generate one either. Draft tickets have
no test plan section at all. Individual cases cannot be edited before saving: it
is save-all or discard, and you can generate again.

**Staleness.** If the ticket is edited after cases are generated, the panel says
so and saving is refused, so a plan built on older wording cannot be written over
newer behaviour. A saved plan whose ticket has since changed is shown with a
warning to generate a fresh one.

**Discarded suggestions.** Occasionally the model writes a case that is longer
than a ticket can store, usually a rambling expected result. That single case is
dropped and the rest are kept, and the panel's message says how many were
discarded, so a count lower than the message implies is expected rather than a
fault. Generate again if you want the dropped case back.

**Limits.** 20 generations per developer per hour, one generation at a time per
developer, and one saved plan per ticket. Cases are suggestions, not verified
requirements: check them against the ticket before relying on them.

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
- Test plan AI failure: the panel names what happened (timeout, upstream error,
  invalid output, usage limit). Nothing is saved to the ticket. **Retry
  generation** repeats the same request explicitly; it is disabled once the
  ticket has changed, in which case generate a new plan instead.

Online ordinary signup will require configured SMTP delivery. Planned generated
demo accounts will bypass email delivery, but are not provisioned in this slice.

Priority appears as a colored pill: **Low** is yellow, **Medium** orange, and
**High** red. Existing Urgent tickets become High. Click the priority or delivery
status pill to choose a value; use arrow keys and Enter, or Escape to dismiss.
Status colors are gray (To do/Cancelled), blue (In progress), purple (In review),
and green (Done). Read-only tickets and request-list badges use the same pills.

Click **Due date** to open the purple calendar. Choose a day, navigate with the
month/year controls, or enter **Exact date** as YYYY-MM-DD and select **Apply
date**. **Today** selects your local calendar day; **Clear date** leaves the
ticket Unscheduled. Escape or clicking outside dismisses the calendar without
applying pending text. Use arrow keys to move between days and Enter to select.
Draft changes autosave; published changes still require **Update**.
