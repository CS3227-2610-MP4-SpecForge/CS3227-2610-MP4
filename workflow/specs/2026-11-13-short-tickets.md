# Short tickets and whole-ticket AI edits

Status: requested by the user on 2026-11-13 ("Reduce the limit to 3k characters";
"At <3k characters, do we still need the model to copy text directly?"; "reduce
storage from 24000 to 3k as well - assume that everything currently in the DB can
be lost with no consequence").
Amends [reliable AI edits](2026-11-13-reliable-ai-edits.md) and the 24,000 limit
in [ticket character count](2026-11-13-ticket-character-count.md).

## Problem

A live sweep on `qwen3.5:9b` (2026-11-13) showed AI edits failing on tickets over
6,000 characters, where the model must copy text exactly: Apply answers worked 6
of 6 times below 6,000 and 1 of 6 above. The team needs a small, testable scope
before the deadline.

## Behaviour

1. A ticket description holds at most **3,000** characters (title stays 160). The
   editor counter, over-limit notice and save checks use it; the browser lets a
   PM type up to twice the limit so pasted text is kept and flagged, not cut.
2. The server and the database reject saves, publishes and AI requests whose
   description exceeds 3,000 characters.
3. Every AI edit returns the whole revised ticket (`proposal`); exact-text
   `find`/`replace` edits are removed. The prompt asks the model to keep the
   description within 3,000 characters; a longer proposal fails as
   `invalid_schema` and is refunded.
4. Stored `unmatched_edit` diagnostics on old turns still display their text.

## Permissions and data

A migration lowers `private.valid_request_fields` to 3,000 and cuts every stored
description, AI turn snapshot and proposal to 3,000 characters in place, without
recording activity or changing revisions (existing data is disposable). It then
fails if any stored row still violates the bound.

## Acceptance criteria

1. Saving or publishing a 3,000-character description succeeds; 3,001 is rejected
   with 400.
2. An AI request on a 3,001-character description is rejected before SoC.
3. Every edit turn sends rewrite instructions; a response with `edits` fails as
   `invalid_schema`.
4. The database rejects a 3,001-character description even from a direct RPC call.
5. The editor counter shows `/ 3,000`.

## Test boundaries

Unit (`soc.test.ts`, deterministic transport); local database API test for save
limits and a direct RPC over the limit; component test for the counter.
