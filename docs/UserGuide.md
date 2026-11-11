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

## Where to run it

- **Production:** <https://specforge-prod.vercel.app>
- **Development:** <https://specforge-dev.vercel.app>

Both are deployed by the team's GitHub Actions workflows (see
[Deployment](DeveloperGuide.md#deployment-and-environments)). Signing up on a
hosted environment needs the verification email to reach you; if no code
arrives, use the local app below, where every email is captured locally.

## Try the local app

Follow the [developer setup](DeveloperGuide.md#local-setup), then open
<http://localhost:3000>. Use disposable test information, not production data.
On a hosted environment the steps are the same, except that the code arrives in
your own inbox instead of the local one.

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
   to appear. The page has its own address, so you can reload or bookmark it.
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

## Notifications

Action feedback appears at the top centre of the screen for three seconds.
Success/information uses purple styling; errors use red. New notifications replace
older ones and restart the timer. Banners float above an open modal without
moving its content or changing keyboard focus.

Loading indicators, field guidance, save/conflict state and saved AI failure
history stay beside their related controls. Retry/reconciliation controls and
unsaved input remain available after an error banner disappears. Signup's
verification link also remains available after its notification expires.

## Invitations and membership

The management overlay groups invitation controls in a light-purple **Invite Member** panel. **Existing members** lists usernames with an Admin pill where applicable and their application role underneath. Admins appear first; each group is sorted alphabetically by username. Promote/demote controls appear beside each member.

Choose **Manage** beside an organisation to open its management overlay. Close it
with the **X** in the fixed header or Escape. The header stays visible while the
management content scrolls. On opening, Shift+Tab reaches the X; Tab moves
through the management controls. Admins use **Invite by email** for any email address,
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
pending.** Error/failure notifications also use three-second overlays, with a red
background. Retry controls and blocked-save state remain available after the
notification disappears.

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
directly, or write a rough idea in **Description** and choose **Draft with AI**
beside the Write and Preview tabs. On an empty ticket you can also type the rough
idea into the AI assistant's box and choose **Ask AI**. Rough ideas autosave privately like
any draft. A fresh AI draft fills the editor and has **Undo AI draft** during the
current editing session while its generated content is unchanged. AI never
publishes for you; failed, stale or recovered generations require review instead.

The ticket occupies the main workspace. The right **AI assistant** panel starts
open. It shows the whole conversation as one scrolling transcript, oldest first,
and follows the newest reply; if you have scrolled up, a **New reply ↓** button
appears instead. The usage bar, **Check for gaps** and the instruction box stay
at the bottom of the panel. Use **Hide AI
assistant** or **Show AI assistant** to collapse or reopen it; on phones it
appears beneath the ticket. Collapsing keeps your conversation, typed instruction
and pending suggestion. Chat is private to the original PM
author, including from admins and after publication.

Use the **Ask AI to change or explain this ticket** box and **Ask AI** for
questions and suggested edits. Review suggestions before applying them.

**Check for gaps** lists up to five open decisions, each with suggested answers,
**Leave undecided** and **Your own answer**. It never changes the ticket. Answer
what you can and choose **Apply answers**: one request writes your answers into a
suggestion, recording undecided questions as unresolved. Unanswered questions are
left out.

SoC writing remains experimental: a valid response can add unsupported requirements,
omit supplied details, or contradict an unresolved question. Check the entire draft
and every suggestion before accepting or publishing. If a writing action returns
only discussion, no ticket changes are available to review; continue manually or
send a more specific instruction. Invalid responses preserve your existing work.
AI edits change exact pieces of text; if the text it names is not in your ticket
exactly once, nothing is applied.

A complete title/description suggestion can still be reviewed if SoC omits its
accompanying message; the app displays “Review these suggested ticket changes.”
Extra response fields are ignored. Incomplete ticket suggestions still fail safely
rather than replacing either field with partial content.

Each AI reply that suggests ticket changes shows a card with a summary (for
example “3 changes: title and 2 in Description”), a status (**Not reviewed**,
**1 of 3 applied**, **All applied**, **Dismissed** or **Outdated**) and **Review
changes**. Review opens a window with your original text on the left and the
proposed text on the right, one row per change: the title first, then each
changed part of the Description. Changed words are highlighted, unchanged lines
are collapsed, and **Formatted** shows both sides as rendered Markdown.

- **Accept** applies that change to the editor straight away; the row then shows
  **Applied** with **Undo**.
- **Reject** marks the row **Rejected**. Rejections last until you reload the page.
- **Accept all** and **Reject all** act on every change that is still open.
- **Done**, ✕ or Esc closes the window.

A change can be accepted only while the text it replaces is still in your ticket,
unchanged and appearing once. If you have edited that part since, the row says
“You've changed this part since” and cannot be accepted; other changes in the same
suggestion stay usable. Accepted changes are ordinary edits, so if a save problem
appears, accepting is paused until you resolve it. Recovered or historical AI
drafts never automatically replace the editor.

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
check finds no turn, **Send again** uses the current ticket. If the check fails,
reopen the AI assistant to try again. A failure shows one sentence saying your
ticket is unchanged and did not use one of your hourly AI requests, plus **Try again** while the
ticket snapshot still matches. **Details** explains what happened:

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

**Usage.** A bar above the instruction box shows, for example, **14/20 AI requests
left this hour**. It turns red at zero and adds the reset time once fewer than five remain. Failed requests give their
request back, but every attempt counts toward the 40-attempt limit.
Repeating a request that already completed on the unchanged ticket shows the
saved answer without using a request. At most 40 attempts (including failures)
are allowed per hour. When a limit is reached, the panel says which one;
manual editing always remains available.

App limits (not SoC quotas): one active AI request per ticket/account, the
hourly limits above, 4,000-character instructions and a 90-second provider
deadline. AI sees the current ticket, your instruction and at most your three
latest completed requests. If the ticket alone is too long for AI, the panel
says so before sending. Chat storage is bounded to 1MiB per ticket. Long or
truncated AI responses fail safely; ask for a concise change or edit manually.

Markdown display supports headings, lists, paragraphs, `**bold text**`,
`*italic text*` or `_italic text_`, and fenced code. Raw HTML, images and links
are displayed as text.
Ticket lists use 50-item pages with **Load more tickets**.

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

- No verification email on a hosted environment: hosted signup depends on the
  environment's email delivery. Use the local app instead. Generated demo
  accounts that skip email are planned but not provided yet.
