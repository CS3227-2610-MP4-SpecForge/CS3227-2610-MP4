-- Private, allowlisted failure metadata. No raw provider diagnostics are stored.
alter table public.chat_turns add column diagnostic jsonb;
alter table public.chat_turns drop constraint chat_turns_error_code_check;
alter table public.chat_turns add constraint chat_turns_error_code_check check(error_code in ('unavailable','invalid_output','context_limit','interrupted','configuration','local_timeout','upstream_http','network_error'));
create function private.valid_ai_diagnostic(code text, value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare expected text;
begin
  expected := case code when 'local_timeout' then 'local_deadline' when 'upstream_http' then 'upstream_http' when 'network_error' then 'network' else null end;
  if value is null then return expected is null; end if;
  if expected is null or jsonb_typeof(value) <> 'object' then return false; end if;
  if jsonb_typeof(value->'source') is distinct from 'string' or value->>'source' is distinct from expected then return false; end if;
  if jsonb_typeof(value->'elapsed_ms') is distinct from 'number' or (value->>'elapsed_ms') !~ '^(0|[1-9][0-9]{0,9})$' then return false; end if;
  if (value->>'elapsed_ms')::bigint > 2147483647 then return false; end if;
  if expected = 'upstream_http' then
    return (select count(*) from jsonb_object_keys(value)) = 3 and jsonb_typeof(value->'http_status') = 'number' and (value->>'http_status') ~ '^[1-5][0-9]{2}$';
  end if;
  return (select count(*) from jsonb_object_keys(value)) = 2;
end;
$$;
revoke all on function private.valid_ai_diagnostic(text,jsonb) from public,anon,authenticated;
grant execute on function private.valid_ai_diagnostic(text,jsonb) to service_role;
alter table public.chat_turns add constraint valid_ai_diagnostic check(private.valid_ai_diagnostic(error_code,diagnostic));
-- Replace the old signature rather than leaving an ambiguous PostgREST overload.
drop function public.finish_chat_turn(uuid,uuid,uuid,uuid,integer,text,jsonb,text);
-- Hard conversation storage bound: reserve completion capacity and check the final row.
create or replace function public.begin_chat_turn(target_org uuid, request_id uuid, actor_id uuid, turn_key uuid,
  base_revision integer, input_fields jsonb, user_message text, retry_failed boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item public.feature_requests; turn public.chat_turns; admission_window private.chat_admission; history jsonb;
begin
  item := private.lock_chat_owner(target_org,request_id,actor_id);
  if turn_key is null or base_revision is null or retry_failed is null or not private.valid_request_fields(input_fields)
    or user_message is null or char_length(user_message) not between 1 and 4000 or user_message !~ '[^[:space:]]' then
    raise exception 'Invalid input' using errcode = '22023';
  end if;
  insert into private.chat_admission values(actor_id,clock_timestamp(),0) on conflict do nothing;
  select * into admission_window from private.chat_admission where author_id = actor_id for update;
  update public.chat_turns set status = 'failed', error_code = 'interrupted' where author_id = actor_id and status = 'running' and lease_until <= clock_timestamp();
  select * into turn from public.chat_turns t where t.request_id = begin_chat_turn.request_id and t.turn_key = begin_chat_turn.turn_key for update;
  if found then
    if turn.message <> user_message or turn.input_fields <> input_fields or turn.base_revision <> base_revision then raise exception 'Turn input changed' using errcode = '22023'; end if;
    if turn.status <> 'failed' or not retry_failed then return jsonb_build_object('dispatch',false,'turn',to_jsonb(turn)); end if;
  end if;
  if item.revision <> base_revision then raise exception 'Task revision changed'; end if;
  if exists(select 1 from public.chat_turns where author_id = actor_id and status = 'running') then raise exception 'Another AI turn is running' using errcode = 'PT429'; end if;
  if admission_window.started_at <= clock_timestamp() - interval '1 hour' then admission_window.started_at := clock_timestamp(); admission_window.attempts := 0; end if;
  if admission_window.attempts >= 20 then raise exception 'AI usage limit reached' using errcode = 'PT429'; end if;
  -- Reserve metadata plus the worst escaped reply/proposal before admitting.
  -- Retries replace one row, so do not count the same row twice.
  if (select coalesce(sum(octet_length(to_jsonb(t)::text)),0) from public.chat_turns t where t.request_id = begin_chat_turn.request_id and t.id is distinct from turn.id) + octet_length(input_fields::text) + octet_length(to_jsonb(user_message)::text) + 202048 > 1048576 then
    raise exception 'Conversation capacity reached' using errcode = 'PT429';
  end if;
  update private.chat_admission set started_at = admission_window.started_at, attempts = admission_window.attempts + 1 where author_id = actor_id;
  if turn.id is null then
    insert into public.chat_turns(request_id,organisation_id,author_id,turn_key,base_revision,input_fields,message,status,lease_until)
    values(request_id,target_org,actor_id,turn_key,base_revision,input_fields,user_message,'running',clock_timestamp() + interval '120 seconds') returning * into turn;
  else
    update public.chat_turns set status = 'running', generation = generation + 1, lease_until = clock_timestamp() + interval '120 seconds', error_code = null, diagnostic = null
      where id = turn.id returning * into turn;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('message',t.message,'reply',t.reply,'proposal',t.proposal) order by t.created_at,t.id),'[]'::jsonb) into history
    from public.chat_turns t where t.request_id = begin_chat_turn.request_id and t.id <> turn.id;
  return jsonb_build_object('dispatch',true,'turn',to_jsonb(turn),'history',history);
end;
$$;

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
    if human_reply is null or char_length(human_reply) not between 1 and 4000 or human_reply !~ '[^[:space:]]' or (task_proposal is not null and not private.valid_request_fields(task_proposal,true)) then raise exception 'Invalid output' using errcode = '22023'; end if;
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
