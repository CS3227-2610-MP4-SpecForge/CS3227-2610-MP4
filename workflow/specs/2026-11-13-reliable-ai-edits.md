# Reliable PM AI edits

Status: approved by the user on 2026-11-13 (chose "Rewrite short tickets" and
"Freeze both"). Amends items 16–17 and the security preflight's edit rules in
[PM AI assistant redesign](2026-11-10-pm-ai-assistant-redesign.md).

## Problem

Silent or confusing failures in manual use with `qwen3.5:9b`:

1. A chat reply says "Ticket updated with …" but no change card appears and the
   ticket is unchanged. The model returned a reply with no edits; the panel shows
   nothing to say no change was suggested.
2. **Draft with AI** on a long rough idea shows nothing visible. A draft reply
   without a proposal is accepted as a reply-only result.
3. **Check for gaps → Apply answers** fails with `unmatched_edit` on an unchanged
   ticket. A live probe on 2026-11-13 showed the model paraphrasing `find` text
   ("Stamina bar shows…" for "The stamina bar shows…") and inventing field names.
   One bad edit rejects the whole answer set.
4. "AI is responding… You can keep editing." invites edits that make the pending
   suggestion stale.

## Behaviour

1. **Rewrite short tickets.** An `edit` turn whose title plus description is at
   most 6,000 characters asks for the whole revised ticket
   (`{reply, proposal:{title, description}}`, 2,500 output tokens) instead of
   exact-text edits. The existing per-change review shows only what changed. A
   proposal equal to the ticket is a reply-only result.
2. **Longer tickets keep exact-text edits** (1,200 tokens, at most 10 edits,
   literal replacement, all-or-nothing). Matching first tries the literal text;
   if that does not occur exactly once, it retries with literal `\n` turned into
   line breaks and any run of whitespace matching any run of whitespace. The edit
   applies only when that tolerant pattern also matches exactly once.
3. **No silent no-ops.** A `draft` turn, or an `edit` turn carrying gap answers,
   that returns no ticket change fails as `invalid_output` / `invalid_schema` (so
   it is refunded and offers **Try again**). A completed edit turn with no change
   shows "No ticket changes suggested." under the reply.
4. Prompts tell the model that changes are suggestions: the reply never says the
   ticket was updated or saved.
5. **Freeze while AI works.** While a turn is being sent or is running, Title and
   Description are read-only (still selectable and copyable), accepting reviewed
   changes is blocked with "Wait for AI to finish responding.", and the pending
   status reads "AI is responding…". Delivery fields stay editable.

## Permissions and data

Unchanged: model output is untrusted, validated per intent, never applied
without review (except the existing untitled-draft fill with undo), and stored
within field limits. Output keys of another shape are rejected
(`edits`/`questions` on a rewrite turn). No new diagnostic reasons, columns or
migrations. Prompts and ticket text are never logged.

## Acceptance criteria

1. An edit on a ≤6,000-character ticket sends the rewrite instructions with a
   2,500-token budget and returns the model's full ticket as the proposal.
2. An edit on a longer ticket sends exact-text instructions with 1,200 tokens.
3. A `find` differing only in whitespace or escaped line breaks applies; a
   paraphrased or ambiguous `find` still fails as `unmatched_edit`.
4. A reply-only draft, or answers turn with no change, fails as `invalid_schema`.
5. A reply-only edit turn shows "No ticket changes suggested."
6. While AI is responding, Title and Description are read-only and the status
   reads exactly "AI is responding…".

## Test boundaries

- Unit (`src/tests/soc.test.ts`, deterministic transport): mode and budget by
  ticket size, rewrite validation, tolerant matching, no-change failures.
- Component (`chat-panel` / editor): no-change note.
- Browser (`requests.spec.ts`, local fake AI): status text and frozen fields
  during a running turn.
