# SpecForge User Guide

## Current features

This version supports email/password signup, email-code verification, login,
logout, creating/listing/selecting your organisations, invitations and membership
management. Both Product Managers
and Developers use the same workspace. Organisation creators become admins.

Demo kits, feature requests and AI conversations remain approved future work.
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
