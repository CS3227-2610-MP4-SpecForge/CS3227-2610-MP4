-- Check for gaps and Apply answers are removed (workflow/specs/2026-11-13-remove-gap-check.md).
-- Their stored turns are disposable (user decision, 2026-11-13). Function
-- parameters stay so no RPC signature changes; the constraint keeps any caller
-- from storing a gap check or answers again.
delete from public.chat_turns where intent = 'gaps' or questions is not null or answers is not null;
alter table public.chat_turns
  add constraint no_gap_check check(intent <> 'gaps' and questions is null and answers is null);
