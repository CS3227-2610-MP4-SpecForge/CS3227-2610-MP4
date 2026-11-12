# Shared confirmation dialog

Status: requested by the user on 2026-11-13.

## Problem

Several actions still ask with the browser's native `window.confirm`, for
example "Cancel the invitation for someone@example.com?". The native box ignores
the SpecForge theme, cannot name its buttons ("OK"/"Cancel" only) and cannot mark
destructive actions.

## Behaviour

1. `ConfirmProvider`, mounted once by RootLayout, owns one confirmation dialog.
   `useConfirm()` returns `confirm({ title, message?, confirmLabel, cancelLabel?,
   danger? }): Promise<boolean>`. Requests made while one is open queue in order.
2. The dialog reuses `Modal` with a compact `confirm-modal` size. It shows the
   title as a heading, the optional message, and a footer with the cancel button
   (default "Cancel") and the confirm button. `danger` gives the confirm button
   the shared `danger` button variant. Initial focus goes to the cancel button.
3. Cancel, the close button and Escape resolve `false`; the confirm button
   resolves `true`.
4. All in-app native confirms use it: membership actions (decline, cancel
   invitation, promote/demote, remove, leave), delete draft, reload saved
   request, reload delivery details, start a new comment attempt, and the
   unsaved-changes guard for in-app links and sign out.
5. Leaving through browser refresh, close or address bar keeps the browser's
   native unload prompt; browsers do not allow custom UI there.
6. The notification host becomes a stack so toasts raised after a nested
   confirmation closes still appear in the remaining open modal.

## Acceptance criteria

- No `window.confirm` remains under `src/components/`.
- Component tests cover confirm/cancel/Escape results, button labels, danger
  styling, initial focus, queueing and accessibility.
- Browser journeys that accepted or dismissed native dialogs click the styled
  dialog's buttons instead.

## Testing interfaces

- Component: `src/components/confirm.test.tsx` through roles and labels.
- Browser: membership, demo kits, accounts (sign-out guard) and profile journeys.
