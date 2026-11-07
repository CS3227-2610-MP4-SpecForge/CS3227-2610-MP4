-- Remove the per-reply character ceiling; retain nonblank and aggregate storage checks.
-- The existing 202048-byte admission reserve exceeds the 64KiB provider envelope
-- (which includes the escaped reply and proposal) plus persisted row metadata.
alter table public.chat_turns drop constraint chat_turns_reply_check;
alter table public.chat_turns add constraint chat_turns_reply_check
  check(reply is null or (char_length(reply) >= 1 and reply ~ '[^[:space:]]'));

create or replace function public.finish_chat_turn(target_org uuid, request_id uuid, actor_id uuid, turn_id uuid,
  worker_generation integer, human_reply text, task_proposal jsonb, failure_code text, failure_diagnostic jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare turn public.chat_turns;
begin
  perform private.lock_chat_owner(target_org,request_id,actor_id);
  select * into turn from public.chat_turns where id = turn_id and organisation_id = target_org and chat_turns.request_id = finish_chat_turn.request_id and author_id = actor_id for update;
  if not found or turn.status <> 'running' or turn.generation is distinct from worker_generation or turn.lease_until <= clock_timestamp() then raise exception 'Turn changed'; end if;
  if not private.valid_ai_diagnostic(failure_code,failure_diagnostic) then raise exception 'Invalid diagnostic' using errcode = '22023'; end if;
  if failure_code is null then
    if human_reply is null or char_length(human_reply) < 1 or human_reply !~ '[^[:space:]]' or (task_proposal is not null and not private.valid_request_fields(task_proposal,true)) then raise exception 'Invalid output' using errcode = '22023'; end if;
  elsif failure_code not in ('unavailable','invalid_output','context_limit','interrupted','configuration','local_timeout','upstream_http','network_error') or human_reply is not null or task_proposal is not null then raise exception 'Invalid failure' using errcode = '22023'; end if;
  if (select coalesce(sum(octet_length(to_jsonb(t)::text)),0) from public.chat_turns t where t.request_id = finish_chat_turn.request_id and t.id <> turn_id)
    + octet_length((to_jsonb(turn) || jsonb_build_object('status',case when failure_code is null then 'completed' else 'failed' end,'reply',human_reply,'proposal',task_proposal,'error_code',failure_code,'diagnostic',failure_diagnostic))::text) > 1048576 then
    raise exception 'Conversation capacity reached' using errcode = 'PT429';
  end if;
  update public.chat_turns set status = case when failure_code is null then 'completed' else 'failed' end,
    reply = human_reply, proposal = task_proposal, error_code = failure_code, diagnostic = failure_diagnostic where id = turn.id returning * into turn;
  return to_jsonb(turn);
end;
$$;
revoke all on function public.finish_chat_turn(uuid,uuid,uuid,uuid,integer,text,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.finish_chat_turn(uuid,uuid,uuid,uuid,integer,text,jsonb,text,jsonb) to service_role;
