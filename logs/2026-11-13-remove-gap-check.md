# 2026-11-13: Remove Check for gaps

- Changes: Check for gaps, its checklist and Apply answers are removed
  ([spec](../workflow/specs/2026-11-13-remove-gap-check.md)). The assistant has
  two intents, `draft` and `edit`; the server rejects `gaps` and `answers`, and
  prompts, output schemas, types, the fake AI and the gaps CSS no longer handle
  questions or answers. A migration deletes stored gap and apply-answers turns
  (data declared disposable) and adds a `chat_turns` constraint refusing them;
  RPC signatures are unchanged. Guides updated.
- Reason: a live `qwen3.5:9b` sweep found Check for gaps worked in 3 of 12 runs
  at every ticket size because the model wrote options inside the question text.
- Validation: `npm run verify` passed (309 tests, build); migration applied to a
  local database; `npm run test:integration` 104/104; full browser suite 57/57
  on port 3001 (the gaps journey was deleted). All three were rerun after the
  work was restored from another session's stash; the code review approved it.
