# PM AI assistant redesign

Status: approved by the user on 2026-11-11 ("Approve as drafted"), with the
default open decisions. Branch `pm-features`. Supersedes the panel
layout and context rules of [ticket-first AI](2026-11-08-ticket-first-ai.md) where
they conflict; its review, freshness, undo and privacy rules stay.

## Problem and user

A Product Manager uses AI to draft and refine one ticket. Feedback calls the
feature messy, asks why there are two AI text boxes, and asks why AI use has no
visible limit. Causes found in the current code:

- A new draft shows three inputs: **What needs to change?** (a second copy of the
  Description, `chat-panel.tsx`), the Description itself, and **AI instruction or
  question**. AI output appears as chat bubbles, review buttons on old turns and
  a separate review card.
- A 20-attempts-per-hour limit exists in `begin_chat_turn` but is invisible until
  reached. The 429 message merges busy, rate and storage limits. SoC timeouts and
  upstream errors still use up attempts.
- Every call resends the whole private conversation, including a full ticket
  proposal for each earlier turn (`soc.ts`). Context grows with every turn until
  the 48,000-byte cap ends AI use for that ticket.
- Every edit asks the model to return the whole ticket within 2,000 output tokens.
  A Description can be 24,000 characters, so AI edits to long tickets are cut off.
- Failure notices show transport details (HTTP status, elapsed seconds, "reconciled
  send") as the main message.

Targeted preset buttons and heading-based section merging were added and removed
on 2026-11-08 (`32eb7a6`) because they cluttered the panel and failed on varied
Markdown. This design adds one preset action and does not parse headings.

## Behaviour

### One way to give an instruction

1. Remove the **What needs to change?** starter and its separate textarea. A new
   draft shows only Title and Description in the editor. The rough idea is written
   in Description.
2. When Title is empty and Description is not, the editor shows **Draft with AI**
   under Description. A successful draft fills both fields with **Undo AI draft**,
   as today. **Start manually** is removed; typing a title is manual writing.
3. The AI panel has one composer, labelled **Ask AI to change or explain this
   ticket**, and one preset action, **Check for gaps**. **Leave undecided** as a
   standalone button is removed.

### One place for results

4. The panel shows only the **latest result** above the composer. It is one of:
   - a suggested change, with the existing literal removed/added review, **Accept
     changes** and **Discard**;
   - a reply with no change;
   - a gaps checklist (item 6);
   - a failure notice (item 13).
5. Earlier requests are in a collapsed **Earlier requests** list showing each
   instruction and reply. Their old suggestions can still be opened for review
   and follow the existing stale rules. No bubbles or buttons are shown inline
   for every turn.

### Checking for gaps

6. **Check for gaps** returns up to five questions that materially affect scope or
   acceptance. Each has two to four suggested answers plus **Leave undecided**.
   It never changes the ticket by itself.
7. The PM picks an answer for some or all questions, optionally types their own,
   then chooses **Apply answers**. That sends one request. The result is a
   suggested change: chosen answers are written into the ticket and "undecided"
   questions are recorded under an unresolved-questions heading. Unanswered
   questions are left out.

### Visible, fair usage limits

8. The panel shows remaining usage, for example **14 of 20 AI requests left this
   hour**, with the reset time once fewer than 5 remain. The value comes from the
   server on every chat read and send.
9. A request is charged when admitted and **refunded** when it fails (any
   allowlisted failure code). A separate cap of 40 admitted attempts per hour is
   never refunded and bounds SoC spend, including deliberate failures.
10. Sending the same intent and instruction against the same ticket revision and
    fields as an earlier completed turn returns that turn without calling SoC or
    charging the PM.
11. Limit messages are specific: "Another AI request is still running", "You have
    used all 20 AI requests this hour; more are available at 14:32", "This
    ticket's AI history is full". Manual editing always remains available.
12. Before sending, the browser estimates the request size with the same byte rule
    as the server. If the ticket alone is too large for AI, the composer and
    actions are disabled with that reason instead of failing after a send.

### Plain failures

13. A failure notice is one sentence saying the ticket is unchanged and whether the
    request was refunded, plus **Try again**. The current diagnostic text moves
    behind a **Details** disclosure. "Retry reconciled send" and "Send reconciled
    message with current task" become **Send again**.

## Context and output (SoC resource use)

14. Each request has one intent, chosen by the control used: `draft` (Draft with
    AI), `gaps` (Check for gaps), or `edit` (the composer and Apply answers). The
    intent is stored on the turn.
15. The model receives a short shared rule block plus instructions for that intent
    only, then one untrusted JSON payload:
    `{ ticket: {title, description}, instruction, recent }`. `recent` holds at most
    the last three completed turns as `{instruction, reply}`, with each reply cut
    to 1,000 characters. Earlier proposals and the full history are **never**
    sent. The ticket is the record of decisions.
16. Output budget by intent:

    | Intent | Output | `max_tokens` |
    |---|---|---|
    | `draft` | `{reply, proposal:{title, description}}` | 2,000 |
    | `gaps` | `{reply, questions:[{prompt, options[]}]}` | 600 |
    | `edit` | `{reply, edits:[{field, find, replace}]}` or `{reply}` | 1,200 |

17. **Edits replace exact text.** Each edit names `title` or `description`, a
    `find` string and a `replace` string. The server applies edits in order only if
    each `find` occurs exactly once in the current text, then stores the resulting
    full fields as `proposal`, so the existing review, accept, stale and undo flow
    is unchanged. If any edit does not match exactly once, the whole turn fails as
    `invalid_output` with the new reason `unmatched_edit` and is refunded. Nothing
    is partly applied. Edits with no net change produce a reply-only result.
18. The 48,000-byte request bound, 90-second deadline, 64 KiB response cap, no
    automatic retry, JSON mode and `reasoning_effort: "none"` stay. Because history
    is limited, the bound now depends on ticket size, not conversation length.
19. One model for all intents (`SOCLAAS_CHAT_MODEL`). Per-intent model routing is
    excluded until a comparison like the 2026-11-08 one shows a smaller model is
    reliable for `gaps`.

## Permissions and data

- Unchanged: chat is private to the original PM author. Admission and completion
  are service-role only through `begin_chat_turn` / `finish_chat_turn`, with
  organisation and membership checks, leases, generation fencing, idempotent
  turn keys and the 1 MiB per-ticket storage bound.
- New turn columns: `intent` (`draft | gaps | edit`, default `edit` for existing
  rows) and nullable `questions` (validated: 1–5 items, prompt ≤ 300 characters,
  2–4 options of ≤ 120 characters). `unmatched_edit` is added to the stored
  invalid-output reasons in both TypeScript and `private.valid_ai_diagnostic`.
- `private.chat_admission` tracks admitted attempts and charged requests
  separately. Refunds happen in the database when a turn is finalised as failed
  (in `finish_chat_turn`, or when an expired lease is marked `interrupted`),
  based on the allowlisted failure code, never on a client value. A read-only usage RPC returns the caller's own
  `{remaining, limit, resets_at}` only.
- Model output stays untrusted: questions, options and replies are rendered as
  text or through the existing safe Markdown renderer. The ticket and recent
  replies are sent as data, never interpolated into instructions.
- Never log prompts, ticket text, replies or provider bodies.

## Security preflight requirements (2026-11-11)

The independent preflight refined these points within the approved behaviour:

- Refunds are a fairness rule, not a spend control. A PM can cause failures on
  purpose, so the 40-attempt hourly cap, which is never refunded, is the real
  bound on SoC spend. Every allowlisted failure is refunded, including
  `context_limit`, which never reaches SoC.
- A refund applies once per charged generation and only when that charge falls
  in the current usage window. The count never goes below zero. Refunds happen
  only in the database: `finish_chat_turn` and expired-lease marking.
- The intent is validated in the client request, in TypeScript and by a database
  CHECK. Instructions and output budgets come from a server map. Retries and
  replays must repeat the stored intent and answers. Draft, gap-check and
  apply-answers turns carry fixed server messages.
- Output that belongs to another intent is rejected (for example, a proposal on
  an edit turn, or edits on a gaps turn). There are at most 10 edits. Matching is
  literal, overlapping matches count as ambiguous, and replacements are inserted
  literally. An empty `find` only fills an empty field. Edits apply to the
  admitted snapshot, and the result must satisfy the stored field limits.
- **Apply answers** sends `{question, answer}` data inside the untrusted payload,
  not as instruction text. **Leave undecided** and **Your own answer** come from
  the client, never the model. Questions and options render only as text.
- Dedupe runs inside `begin_chat_turn` after the owner lock. It needs the same
  ticket, author, intent, message and answers, the current revision and fields,
  and a completed turn. It never matches failed or running turns.
- `read_ai_usage()` takes no user parameter, uses `auth.uid()`, makes no writes
  and is granted to `authenticated` only.
- The browser's size estimate is advisory; the server's 48,000-byte check
  decides. The usage meter can lag behind an abandoned turn until its expired
  lease is refunded at the next admission.

## Out of scope

- Developer test plan AI, including a shared PM/Developer budget.
- Organisation-level AI budgets or admin quota settings.
- Streaming, model routing, automatic retries or fallback models.
- Showing suggestions inline inside the editor text area.
- Deleting or migrating existing conversation rows; they remain readable.

## Open decisions (defaults used above)

1. Limits: 20 charged requests and 40 attempts per PM per hour.
2. Refund `invalid_output` (default yes: it is the model's failure).
3. Keep **Earlier requests** visible but collapsed (alternative: hide entirely).
4. History window of three turns.

## Modules

- `src/assistance.ts` → intent definitions and per-intent instructions/budgets.
- `src/server/soc.ts` → payload builder, per-intent validator, edit application.
  `requestSocJson` is unchanged apart from receiving `maxTokens` per intent.
- `src/server/chat.ts` → accepts `intent`, returns `usage` on GET and POST.
- Migration → turn columns, admission accounting, refunds, dedupe, usage RPC.
- `src/components/chat-panel.tsx`, `request-editor.tsx`, `suggestion-review.tsx`
  → single composer, latest-result area, gaps checklist, usage meter, plain
  failures. Reuse shared components and tokens per [ui.md](../ui.md).
- Update the User Guide and Developer Guide sections on AI chat and limits.

## Acceptance criteria

1. A new draft never shows more than one AI text input; Description is the only
   rough-idea field.
2. The usage meter matches the server and decreases only for charged requests.
3. A provider timeout, upstream error or invalid output leaves usage unchanged
   after completion. The attempt cap still blocks the 41st attempt in an hour.
4. Repeating an identical completed request makes no provider call and no charge.
5. The provider payload never contains earlier proposals or more than three
   earlier turns. Its size does not grow after the fourth turn on an unchanged
   ticket.
6. An edit on a ticket with a 20,000-character Description succeeds when the model
   returns a small exact-text edit, and the review shows only the changed text.
7. An edit whose `find` text is missing or ambiguous fails as `unmatched_edit`,
   changes nothing and is refunded.
8. Check for gaps returns a checklist; Apply answers makes exactly one request and
   produces a reviewable suggestion recording undecided items as unresolved.
9. Failure notices show one plain sentence and **Try again**; diagnostics are
   available only under Details.
10. Existing privacy, stale-suggestion, undo, autosave and publish rules still pass.

## Test boundaries

- Unit, deterministic transport: payload shape and history window; per-intent
  `max_tokens`; schema validation for each intent; edit application (exact
  match, missing, ambiguous, multiple ordered edits, no-op); question limits.
- Local database: charge and refund for each failure code; attempt cap; dedupe
  without charge; usage RPC returns only the caller's own usage; intent and
  question validation; other members and admins still cannot read the chat.
- Browser with `localFakeAi` extended for intents, edits and questions: single
  composer on a new draft; Draft with AI and undo; Check for gaps → Apply answers →
  accept; usage meter decrement and exhaustion message; failure with Details.
- Security preflight before coding (LLM context and output change) and security
  review after; one code/architecture review.
