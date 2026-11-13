# Ticket character count

Status: requested and approved by the user on 2026-11-13 ("add it in small grey
text at the bottom right of the input box"; "Yes, restore them"; "add the used /
4000 counter but not the your own answer counter").

## Problem

Title (160 characters) and Description (24,000) have limits, but a PM learns of
them only from the error shown after going over.

## Behaviour

1. The editor's Title and Description show `used / limit` in small muted text in
   the bottom-right corner inside the box, for example `19 / 160` and
   `1,204 / 24,000`. Limits come from `requestFields`.
2. Characters are counted as the server counts them (`[...value].length`), so an
   emoji counts as one.
3. Over the limit the count uses the danger colour and bold weight. Input stays
   allowed up to the existing `maxLength` (twice the limit) so pasted text is not
   cut off; saving still refuses it.
4. The count has the box's own background so scrolled text never shows through
   it, including while the field is read-only during an AI response.
5. The AI assistant's message box shows the same count against its 4,000-character
   limit (`messageLimit`, shared with the server check). Its existing over-limit
   notice and disabled **Ask AI** stay. Gap answers ("Your own answer", 500) get
   no counter; that box stops at its limit.
6. Each input is described by its count (`N / limit characters` for screen
   readers); it is not a live region.

## Acceptance criteria

1. `Field` with `limit` shows the count and is described by "N / limit characters".
2. An emoji counts as one; large numbers are grouped ("24,000").
3. A count over its limit carries the over-limit style.
4. The editor shows both counts, and the Description count updates as the PM types.
5. The AI message box is described by "N / 4,000 characters" and updates as the PM types.

## Test boundaries

Component tests `src/components/character-count.test.tsx` and
`src/components/chat-panel.test.tsx`; one browser assertion
in `src/tests/browser/requests.spec.ts` for the editor's Description count.
