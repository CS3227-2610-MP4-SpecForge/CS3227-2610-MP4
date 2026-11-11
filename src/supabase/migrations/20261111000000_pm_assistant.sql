-- PM assistant redesign: one intent per turn, structured gap questions and
-- answers, visible usage with refunds, dedupe and a bounded worker history.
-- The 40-attempt cap is never refunded and is the real bound on SoC spend.

create function private.valid_ai_questions(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare item jsonb; opt jsonb;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) <> 'array' or jsonb_array_length(value) not between 1 and 5 then return false; end if;
  for item in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(item) <> 'object' or (select count(*) from jsonb_object_keys(item)) <> 2 then return false; end if;
    if jsonb_typeof(item->'prompt') is distinct from 'string' or char_length(item->>'prompt') > 300 or item->>'prompt' !~ '[^[:space:]]' then return false; end if;
    if jsonb_typeof(item->'options') is distinct from 'array' or jsonb_array_length(item->'options') not between 2 and 4 then return false; end if;
    for opt in select * from jsonb_array_elements(item->'options') loop
      if jsonb_typeof(opt) <> 'string' or char_length(opt #>> '{}') > 120 or (opt #>> '{}') !~ '[^[:space:]]' then return false; end if;
    end loop;
  end loop;
  return true;
end;
$$;

create function private.valid_ai_answers(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare item jsonb;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) <> 'array' or jsonb_array_length(value) not between 1 and 5 then return false; end if;
  for item in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(item) <> 'object' or (select count(*) from jsonb_object_keys(item)) <> 2 then return false; end if;
    if jsonb_typeof(item->'question') is distinct from 'string' or char_length(item->>'question') > 300 or item->>'question' !~ '[^[:space:]]' then return false; end if;
    if jsonb_typeof(item->'answer') = 'null' then continue; end if;
    if jsonb_typeof(item->'answer') is distinct from 'string' or char_length(item->>'answer') > 500 or item->>'answer' !~ '[^[:space:]]' then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.valid_ai_questions(jsonb), private.valid_ai_answers(jsonb) from public,anon,authenticated;
-- CHECK constraints run as the writer; the worker writes turns directly in tests.
grant execute on function private.valid_ai_questions(jsonb), private.valid_ai_answers(jsonb) to service_role;

alter table public.chat_turns
  add column intent text not null default 'edit' check(intent in ('draft','gaps','edit')),
  add column questions jsonb check(private.valid_ai_questions(questions)),
  add column answers jsonb check(private.valid_ai_answers(answers)),
  -- When this generation was charged; null when never charged or refunded.
  add column charged_at timestamptz,
  add constraint intent_outputs check((questions is null or intent = 'gaps') and (intent <> 'gaps' or proposal is null) and (answers is null or intent = 'edit'));

alter table private.chat_admission add column charged integer not null default 0;

-- Fixed invalid-output reasons, now including unmatched exact-text edits.
create or replace function private.valid_ai_diagnostic(code text, value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare expected text;
begin
  if code = 'invalid_output' then
    if value is null then return true; end if;
    if jsonb_typeof(value) <> 'object'
      or jsonb_typeof(value->'source') is distinct from 'string'
      or value->>'source' is distinct from 'invalid_output'
      or jsonb_typeof(value->'reason') is distinct from 'string' then return false; end if;
    return (select count(*) from jsonb_object_keys(value)) = 2
      and value->>'reason' in ('truncated','invalid_json','invalid_schema','invalid_envelope','missing_content','tool_calls','unexpected_finish','body_limit','unsafe_section','unmatched_edit');
  end if;
  expected := case code when 'local_timeout' then 'local_deadline' when 'upstream_http' then 'upstream_http' when 'network_error' then 'network' else null end;
  if value is null then return expected is null; end if;
  if expected is null or jsonb_typeof(value) <> 'object' then return false; end if;
  if jsonb_typeof(value->'source') is distinct from 'string' or value->>'source' is distinct from expected then return false; end if;
  if jsonb_typeof(value->'elapsed_ms') is distinct from 'number' or (value->>'elapsed_ms') !~ '^(0|[1-9][0-9]{0,9})$' then return false; end if;
  if (value->>'elapsed_ms')::bigint > 2147483647 then return false; end if;
  if expected = 'upstream_http' then
    if jsonb_typeof(value->'http_status') is distinct from 'number' or (value->>'http_status') !~ '^[3-5][0-9]{2}$' then return false; end if;
    return (select count(*) from jsonb_object_keys(value)) = 3;
  end if;
  return (select count(*) from jsonb_object_keys(value)) = 2;
end;
$$;
revoke all on function private.valid_ai_diagnostic(text,jsonb) from public,anon,authenticated;
grant execute on function private.valid_ai_diagnostic(text,jsonb) to service_role;

-- Refund one charged generation, only when its charge belongs to the current
-- window. Callers hold the account's admission row lock.
create function private.refund_chat_charge(turn_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare charge timestamptz; owner uuid;
begin
  select t.charged_at, t.author_id into charge, owner from public.chat_turns t where t.id = turn_id for update;
  if charge is null then return; end if;
  update public.chat_turns set charged_at = null where id = turn_id;
  update private.chat_admission set charged = greatest(charged - 1, 0)
    where author_id = owner and started_at <= charge and started_at > clock_timestamp() - interval '1 hour';
end;
$$;
revoke all on function private.refund_chat_charge(uuid) from public,anon,authenticated;

drop function public.begin_chat_turn(uuid,uuid,uuid,uuid,integer,jsonb,text,boolean);
create function public.begin_chat_turn(target_org uuid, request_id uuid, actor_id uuid, turn_key uuid,
  base_revision integer, input_fields jsonb, user_message text, retry_failed boolean default false,
  p_intent text default 'edit', p_answers jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item public.feature_requests; turn public.chat_turns; earlier public.chat_turns; admission_window private.chat_admission; history jsonb; expired uuid;
begin
  item := private.lock_chat_owner(target_org,request_id,actor_id);
  if turn_key is null or base_revision is null or retry_failed is null or not private.valid_request_fields(input_fields)
    or user_message is null or char_length(user_message) not between 1 and 4000 or user_message !~ '[^[:space:]]'
    or p_intent is null or p_intent not in ('draft','gaps','edit') or not private.valid_ai_answers(p_answers)
    or (p_answers is not null and p_intent <> 'edit') then
    raise exception 'Invalid input' using errcode = '22023';
  end if;
  insert into private.chat_admission(author_id,started_at,attempts) values(actor_id,clock_timestamp(),0) on conflict do nothing;
  select * into admission_window from private.chat_admission where author_id = actor_id for update;
  for expired in update public.chat_turns set status = 'failed', error_code = 'interrupted'
      where author_id = actor_id and status = 'running' and lease_until <= clock_timestamp() returning id loop
    perform private.refund_chat_charge(expired);
  end loop;
  select * into admission_window from private.chat_admission where author_id = actor_id;
  select * into turn from public.chat_turns t where t.request_id = begin_chat_turn.request_id and t.turn_key = begin_chat_turn.turn_key for update;
  if found then
    if turn.message <> user_message or turn.input_fields <> input_fields or turn.base_revision <> base_revision
      or turn.intent <> p_intent or turn.answers is distinct from p_answers then raise exception 'Turn input changed' using errcode = '22023'; end if;
    if turn.status <> 'failed' or not retry_failed then return jsonb_build_object('dispatch',false,'turn',to_jsonb(turn)); end if;
  end if;
  if item.revision <> base_revision then raise exception 'Task revision changed'; end if;
  -- Identical completed request on the current ticket: return it, no charge.
  if turn.id is null then
    select * into earlier from public.chat_turns t where t.request_id = begin_chat_turn.request_id and t.author_id = actor_id
      and t.status = 'completed' and t.intent = p_intent and t.message = user_message and t.answers is not distinct from p_answers
      and t.base_revision = item.revision and t.input_fields = begin_chat_turn.input_fields
      order by t.created_at desc, t.id desc limit 1;
    if found then return jsonb_build_object('dispatch',false,'turn',to_jsonb(earlier)); end if;
  end if;
  if exists(select 1 from public.chat_turns where author_id = actor_id and status = 'running') then raise exception 'Another AI turn is running' using errcode = 'PT429'; end if;
  if admission_window.started_at <= clock_timestamp() - interval '1 hour' then
    admission_window.started_at := clock_timestamp(); admission_window.attempts := 0; admission_window.charged := 0;
  end if;
  if admission_window.attempts >= 40 then raise exception 'AI attempt limit reached' using errcode = 'PT429'; end if;
  if admission_window.charged >= 20 then raise exception 'AI usage limit reached' using errcode = 'PT429'; end if;
  -- Reserve metadata plus the worst escaped reply/proposal before admitting.
  -- Retries replace one row, so do not count the same row twice.
  if (select coalesce(sum(octet_length(to_jsonb(t)::text)),0) from public.chat_turns t where t.request_id = begin_chat_turn.request_id and t.id is distinct from turn.id) + octet_length(input_fields::text) + octet_length(to_jsonb(user_message)::text) + octet_length(coalesce(p_answers::text,'')) + 202048 > 1048576 then
    raise exception 'Conversation capacity reached' using errcode = 'PT429';
  end if;
  update private.chat_admission set started_at = admission_window.started_at, attempts = admission_window.attempts + 1, charged = admission_window.charged + 1 where author_id = actor_id;
  if turn.id is null then
    insert into public.chat_turns(request_id,organisation_id,author_id,turn_key,base_revision,input_fields,message,status,lease_until,intent,answers,charged_at)
    values(request_id,target_org,actor_id,turn_key,base_revision,input_fields,user_message,'running',clock_timestamp() + interval '120 seconds',p_intent,p_answers,clock_timestamp()) returning * into turn;
  else
    update public.chat_turns set status = 'running', generation = generation + 1, lease_until = clock_timestamp() + interval '120 seconds', error_code = null, diagnostic = null, charged_at = clock_timestamp()
      where id = turn.id returning * into turn;
  end if;
  -- Bounded context: the latest three completed turns, replies cut to 1,000
  -- characters, never proposals or questions. The ticket records decisions.
  select coalesce(jsonb_agg(jsonb_build_object('message',r.message,'reply',left(r.reply,1000)) order by r.created_at,r.id),'[]'::jsonb) into history
    from (select t.message, t.reply, t.created_at, t.id from public.chat_turns t
      where t.request_id = begin_chat_turn.request_id and t.id <> turn.id and t.status = 'completed'
      order by t.created_at desc, t.id desc limit 3) r;
  return jsonb_build_object('dispatch',true,'turn',to_jsonb(turn),'history',history);
end;
$$;
revoke all on function public.begin_chat_turn(uuid,uuid,uuid,uuid,integer,jsonb,text,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.begin_chat_turn(uuid,uuid,uuid,uuid,integer,jsonb,text,boolean,text,jsonb) to service_role;

drop function public.finish_chat_turn(uuid,uuid,uuid,uuid,integer,text,jsonb,text,jsonb);
create function public.finish_chat_turn(target_org uuid, request_id uuid, actor_id uuid, turn_id uuid,
  worker_generation integer, human_reply text, task_proposal jsonb, failure_code text, failure_diagnostic jsonb default null,
  task_questions jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare turn public.chat_turns;
begin
  perform private.lock_chat_owner(target_org,request_id,actor_id);
  perform 1 from private.chat_admission where author_id = actor_id for update;
  select * into turn from public.chat_turns where id = turn_id and organisation_id = target_org and chat_turns.request_id = finish_chat_turn.request_id and author_id = actor_id for update;
  if not found or turn.status <> 'running' or turn.generation is distinct from worker_generation or turn.lease_until <= clock_timestamp() then raise exception 'Turn changed'; end if;
  if not private.valid_ai_diagnostic(failure_code,failure_diagnostic) then raise exception 'Invalid diagnostic' using errcode = '22023'; end if;
  if failure_code is null then
    if human_reply is null or char_length(human_reply) < 1 or human_reply !~ '[^[:space:]]' or (task_proposal is not null and not private.valid_request_fields(task_proposal,true))
      or not private.valid_ai_questions(task_questions) or (task_questions is not null and turn.intent <> 'gaps') or (task_proposal is not null and turn.intent = 'gaps') then raise exception 'Invalid output' using errcode = '22023'; end if;
  elsif failure_code not in ('unavailable','invalid_output','context_limit','interrupted','configuration','local_timeout','upstream_http','network_error') or human_reply is not null or task_proposal is not null or task_questions is not null then raise exception 'Invalid failure' using errcode = '22023'; end if;
  if (select coalesce(sum(octet_length(to_jsonb(t)::text)),0) from public.chat_turns t where t.request_id = finish_chat_turn.request_id and t.id <> turn_id)
    + octet_length((to_jsonb(turn) || jsonb_build_object('status',case when failure_code is null then 'completed' else 'failed' end,'reply',human_reply,'proposal',task_proposal,'questions',task_questions,'error_code',failure_code,'diagnostic',failure_diagnostic))::text) > 1048576 then
    raise exception 'Conversation capacity reached' using errcode = 'PT429';
  end if;
  -- Every allowlisted failure is refunded; the attempt counter is not.
  if failure_code is not null then perform private.refund_chat_charge(turn.id); end if;
  update public.chat_turns set status = case when failure_code is null then 'completed' else 'failed' end,
    reply = human_reply, proposal = task_proposal, questions = task_questions, error_code = failure_code, diagnostic = failure_diagnostic,
    charged_at = case when failure_code is null then chat_turns.charged_at else null end
    where id = turn.id returning * into turn;
  return to_jsonb(turn);
end;
$$;
revoke all on function public.finish_chat_turn(uuid,uuid,uuid,uuid,integer,text,jsonb,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finish_chat_turn(uuid,uuid,uuid,uuid,integer,text,jsonb,text,jsonb,jsonb) to service_role;

-- The caller's own usage only: no user parameter, no writes. A missing or
-- expired window means full usage. Expired leases are refunded at the next
-- admission, so the meter can lag one request behind an abandoned turn.
create function public.read_ai_usage() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when a.author_id is null or a.started_at <= clock_timestamp() - interval '1 hour'
    then jsonb_build_object('remaining',20,'limit',20,'resets_at',null)
    else jsonb_build_object('remaining',greatest(20 - a.charged,0),'limit',20,'resets_at',a.started_at + interval '1 hour') end
  from (select auth.uid() as uid) me left join private.chat_admission a on a.author_id = me.uid
  where me.uid is not null;
$$;
revoke all on function public.read_ai_usage() from public,anon,authenticated;
grant execute on function public.read_ai_usage() to authenticated;
