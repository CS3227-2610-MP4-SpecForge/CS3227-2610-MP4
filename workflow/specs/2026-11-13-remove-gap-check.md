# Remove Check for gaps

Status: approved by the user on 2026-11-13 ("Yes, remove it"), after a live
`qwen3.5:9b` sweep found Check for gaps worked in 3 of 12 runs at every ticket
size (the model wrote answer options inside the question text). Supersedes the
gaps checklist and Apply answers in
[PM assistant redesign](2026-11-10-pm-ai-assistant-redesign.md) items 6–7 and 14.

## Behaviour

1. The AI panel has one action: **Ask AI**. **Check for gaps**, the questions
   checklist, **Leave undecided**, **Your own answer** and **Apply answers** are
   removed. A PM can still ask "What is missing from this ticket?" in Ask AI.
2. The assistant has two intents, `draft` and `edit`. The server rejects any
   other intent and any `answers` field (400); prompts, output schemas and the
   fake AI no longer handle gap questions or answers.
3. Stored gap-check and apply-answers turns are deleted by a migration (existing
   data is disposable), and a check constraint keeps `chat_turns` free of the
   `gaps` intent, questions and answers. Database functions keep their
   parameters so no RPC signature changes.

## Acceptance criteria

1. The AI panel shows no **Check for gaps** button and no gaps checklist.
2. A chat request with `intent: "gaps"` or with `answers` is rejected with 400.
3. The SoC system prompt mentions no questions or answers.
4. The database refuses to store a `gaps` turn or a turn with answers.

## Test boundaries

Unit (`soc.test.ts`); local database (`assistant.database.test.ts`); browser
layout check that the button is gone.
