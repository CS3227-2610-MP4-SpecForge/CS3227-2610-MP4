# 2026-11-13: Shared confirmation dialog

- Changes: replaced every native `window.confirm` with a themed, promise-based
  `useConfirm()` dialog built on `Modal` (spec:
  [2026-11-13-confirm-dialog](../workflow/specs/2026-11-13-confirm-dialog.md);
  guidance in [ui.md](../workflow/ui.md#confirmations)). Covers membership
  actions, delete draft, reload saved/delivery, new comment attempt, and the
  unsaved-changes guard for in-app links and sign out (`requestDeparture` is now
  async). Browser refresh/close/history keep the native unload prompt. Notification
  hosts and the body scroll lock now support stacked modals. Adds a `.button.danger`
  variant.
- Validation: tsc, eslint, prettier clean; `npx vitest run` 254 passed. Full
  Playwright suite on the final code: 55/56; the failure was the newly extended
  sign-out journey timing out with the account menu closed after a fresh page load
  (cause not confirmed). The test now waits for the editor and reopens the menu if
  needed; the confirm/departure assertions stay outside that retry. After the fix, the affected journeys (sign-out, profile, membership)
  passed in three consecutive focused runs; the full suite was not rerun after
  that fix.
- Review: the first pass found that Leave did nothing for links in a menu that had
  closed, autosave could race a confirmed delete, focus was lost after sign-out
  Stay, and a stale dialog could stay open across a route change. All were fixed
  and the final diff was approved.
