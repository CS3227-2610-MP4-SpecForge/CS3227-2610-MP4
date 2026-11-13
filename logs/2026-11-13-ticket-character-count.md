# 2026-11-13: Ticket character count

- Changes: the ticket editor shows live `used / limit` counts in the bottom-right
  corner of Title (160) and Description (24,000), muted, turning danger-coloured
  and bold over the limit ([spec](../workflow/specs/2026-11-13-ticket-character-count.md)).
  The AI assistant's message box shows the same count against its 4,000-character
  limit, now one `messageLimit` constant shared with the server check; gap
  answers have no counter. Limits come from shared constants and counting
  matches the server (an emoji is one). The count has the box's background so
  scrolled text never shows through it. Shared `Field` and `TextareaField` gained
  a `limit` prop and merge a caller's `aria-describedby` with their own ids.
  User Guide updated.
- Validation: `npm run verify` passed (336 tests, build); `requests.spec` on
  port 3001 passed 19/19, including the Description count updating as the PM
  types; component tests cover the chat count updating. Screenshots checked the
  Title and chat counts.
- Review: the editor counts were approved; earlier review notes (text under the
  count, overridden descriptions, no editor-level test) were fixed first.
