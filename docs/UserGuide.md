# SpecForge User Guide

## Current features

This version supports email/password signup, email-code verification, login,
logout, creating/listing/selecting your organisations, invitations and membership
management, and the manual request lifecycle. Both Product Managers and
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

## Tasks and AI chat

Select an organisation and choose **View requests**. PM authors can create/edit
private drafts; current members read submitted tasks. There are two task fields:
**Title** (up to160 Unicode characters) and **Description** (up to24,000).
Description is free-form Markdown; headings are optional. Existing requests keep
their title and all old section contents under description headings.

New drafts start with **What needs to change?** Write a rough idea and choose
**Draft ticket**, or choose **Start manually** to write the title and description
yourself. Rough ideas autosave privately. A fresh AI draft fills the editor and
has **Undo AI draft** during the current editing session while its generated
content is unchanged. AI never publishes
for you; failed, stale or recovered generations require review instead.

The ticket occupies the main workspace. **Discuss with AI** opens or collapses a
private discussion panel; on phones it appears below the editor. Collapsing keeps
your conversation and typed instruction. Chat is private to the original PM
author, including from admins and after publication.

Use **Improve clarity**, **Add acceptance criteria**, or **Find missing details**
for focused help. Acceptance suggestions preserve your title and other sections;
unrecognized/ambiguous section structures may need manual editing. Finding missing
details asks questions without modifying the ticket. Answer using the single
**AI instruction or question** box and **Ask AI**, or choose **Leave undecided** to
ask AI to record an open question rather than assume its answer. Useful answer
options may appear as chat text; they are not separate selection controls.

AI edits appear as **Suggested ticket changes** in the editor, with removed/added
text. Choose **Accept changes** or **Discard**. Conversational proposals have a
**Review ticket changes** action to open the same review. Acceptance replaces the
reviewed fields locally and clears acknowledgement. Editing during generation or
another saved revision makes suggestions outdated; your writing is preserved.
Recovered or historical AI drafts never automatically replace the editor.

Drafts autosave750ms after a pause. Accepting AI changes in a draft follows that
same autosave. Submission requires a nonempty title/description, acknowledgement
and **Submit request**. Published edits, including accepted AI changes, remain local
until acknowledged **Save changes**. Readers see only the last saved task.
Only the original PM author can edit; Developers cannot edit even when admins.

**Delete draft** asks confirmation; submitted tasks cannot be deleted. Leaving
or removal ends access; submitted work remains visible to members and rejoining
restores author access. Dates and stable author-account IDs remain visible.

On task save failure, local text is preserved and automatic saving stops. Use
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
Lists show at most100requests. No hosted application URL is available yet.

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
