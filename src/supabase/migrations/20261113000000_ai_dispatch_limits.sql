-- Site-wide, organisation and per-user daily AI limits, plus a site-wide pause
-- after SoC pushes back (HTTP 429/503). Spec:
-- workflow/specs/2026-11-13-site-wide-ai-limit.md. The server passes validated
-- caps on every admission; the database checks them again and owns all counts.

-- One row per counted window. Site rows have no organisation or user.
create table private.ai_usage_windows (
  scope text not null check (scope in ('site', 'organisation', 'user')),
  organisation_id uuid references public.organisations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  window_kind text not null check (window_kind in ('minute', 'day')),
  window_start timestamptz not null,
  used integer not null check (used >= 0),
  check ((scope = 'site' and organisation_id is null and user_id is null)
    or (scope = 'organisation' and organisation_id is not null and user_id is null and window_kind = 'day')
    or (scope = 'user' and user_id is not null and organisation_id is null and window_kind = 'day')),
  unique nulls not distinct (scope, organisation_id, user_id, window_kind, window_start)
);
alter table private.ai_usage_windows enable row level security;
revoke all on table private.ai_usage_windows from public, anon, authenticated, service_role;

-- At most one row: SoC asked us to back off until this time.
create table private.ai_soc_pause (
  id boolean primary key default true check (id),
  paused_until timestamptz not null
);
alter table private.ai_soc_pause enable row level security;
revoke all on table private.ai_soc_pause from public, anon, authenticated, service_role;

-- When a test-plan generation was charged to the user's day; null when never
-- charged or refunded. Older turns stay null and are never refunded.
alter table public.test_plan_turns add column charged_at timestamptz;

create function private.sg_day_start(instant timestamptz) returns timestamptz
language sql immutable set search_path = '' as $$
  select pg_catalog.date_trunc('day', instant at time zone 'Asia/Singapore') at time zone 'Asia/Singapore';
$$;
revoke all on function private.sg_day_start(timestamptz) from public, anon, authenticated;

-- Exactly the server's bounds: whole numbers from 1, each under its maximum,
-- and user <= organisation <= site day. Zero is the server's kill switch and
-- never reaches the database.
create function private.valid_ai_limits(limits jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare key text; maximum integer;
begin
  if limits is null or jsonb_typeof(limits) <> 'object' or (select count(*) from jsonb_object_keys(limits)) <> 5 then
    return false;
  end if;
  for key, maximum in select * from (values ('concurrent', 8), ('per_minute', 60), ('site_per_day', 1000),
      ('org_per_day', 500), ('user_per_day', 200)) as bounds(k, m) loop
    if jsonb_typeof(limits->key) is distinct from 'number' or (limits->>key) !~ '^[1-9][0-9]{0,3}$'
      or (limits->>key)::integer > maximum then return false; end if;
  end loop;
  return (limits->>'user_per_day')::integer <= (limits->>'org_per_day')::integer
    and (limits->>'org_per_day')::integer <= (limits->>'site_per_day')::integer;
end;
$$;
revoke all on function private.valid_ai_limits(jsonb) from public, anon, authenticated;

create function private.ai_window_used(p_scope text, p_org uuid, p_user uuid, p_kind text, p_start timestamptz)
returns integer language sql stable set search_path = '' as $$
  select coalesce((select w.used from private.ai_usage_windows w where w.scope = p_scope
    and w.organisation_id is not distinct from p_org and w.user_id is not distinct from p_user
    and w.window_kind = p_kind and w.window_start = p_start), 0);
$$;
revoke all on function private.ai_window_used(text, uuid, uuid, text, timestamptz) from public, anon, authenticated;

create function private.ai_window_add(p_scope text, p_org uuid, p_user uuid, p_kind text, p_start timestamptz, delta integer)
returns void language sql set search_path = '' as $$
  insert into private.ai_usage_windows as w values (p_scope, p_org, p_user, p_kind, p_start, greatest(delta, 0))
    on conflict (scope, organisation_id, user_id, window_kind, window_start)
    do update set used = greatest(w.used + delta, 0);
$$;
revoke all on function private.ai_window_add(text, uuid, uuid, text, timestamptz, integer) from public, anon, authenticated;

-- Admits one SoC dispatch for actor in target_org, or raises PT429 with a fixed
-- message and the whole seconds to wait in DETAIL. Callers already hold their
-- organisation and per-user admission locks; after this advisory lock only
-- window rows are written. A begin's expired-lease refund may lock the actor's
-- own user-day row first, but each account has one role, so only one feature's
-- admission (serialised by its admission row) can reach that row: no cycle.
-- A deadlock would still fail closed (40P01, then 503).
create function private.reserve_ai_dispatch(target_org uuid, actor uuid, limits jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  instant timestamptz;
  day_start timestamptz;
  minute_start timestamptz;
  until_day integer;
  paused timestamptz;
begin
  if not private.valid_ai_limits(limits) then raise exception 'Invalid AI limits' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(3227, 2611);
  -- Read the clock after the lock, so a wait for it cannot leave a stale window.
  instant := pg_catalog.clock_timestamp();
  day_start := private.sg_day_start(instant);
  minute_start := pg_catalog.date_trunc('minute', instant);
  until_day := greatest(ceil(extract(epoch from day_start + interval '1 day' - instant))::integer, 1);
  if private.ai_window_used('user', null, actor, 'day', day_start) >= (limits->>'user_per_day')::integer then
    raise exception 'AI user daily limit reached' using errcode = 'PT429', detail = until_day::text;
  end if;
  if private.ai_window_used('organisation', target_org, null, 'day', day_start) >= (limits->>'org_per_day')::integer then
    raise exception 'AI organisation limit reached' using errcode = 'PT429', detail = until_day::text;
  end if;
  select p.paused_until into paused from private.ai_soc_pause p;
  if paused > instant then
    raise exception 'AI site limit reached' using errcode = 'PT429',
      detail = greatest(ceil(extract(epoch from paused - instant))::integer, 1)::text;
  end if;
  if (select count(*) from public.chat_turns where status = 'running' and lease_until > instant)
      + (select count(*) from public.test_plan_turns where status = 'running' and lease_until > instant)
      >= (limits->>'concurrent')::integer then
    raise exception 'AI site limit reached' using errcode = 'PT429', detail = '15';
  end if;
  if private.ai_window_used('site', null, null, 'minute', minute_start) >= (limits->>'per_minute')::integer then
    raise exception 'AI site limit reached' using errcode = 'PT429',
      detail = greatest(ceil(extract(epoch from minute_start + interval '1 minute' - instant))::integer, 1)::text;
  end if;
  if private.ai_window_used('site', null, null, 'day', day_start) >= (limits->>'site_per_day')::integer then
    raise exception 'AI site daily limit reached' using errcode = 'PT429', detail = until_day::text;
  end if;
  perform private.ai_window_add('user', null, actor, 'day', day_start, 1);
  perform private.ai_window_add('organisation', target_org, null, 'day', day_start, 1);
  perform private.ai_window_add('site', null, null, 'minute', minute_start, 1);
  perform private.ai_window_add('site', null, null, 'day', day_start, 1);
  delete from private.ai_usage_windows w where w.window_start < instant - interval '2 days';
end;
$$;
revoke all on function private.reserve_ai_dispatch(uuid, uuid, jsonb) from public, anon, authenticated;

-- Gives back one user-day charge, only on the same Singapore day it was taken.
create function private.refund_ai_user_day(actor uuid, charged timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if charged is null or private.sg_day_start(charged) <> private.sg_day_start(pg_catalog.clock_timestamp()) then return; end if;
  perform private.ai_window_add('user', null, actor, 'day', private.sg_day_start(charged), -1);
end;
$$;
revoke all on function private.refund_ai_user_day(uuid, timestamptz) from public, anon, authenticated;

-- Extends, never shortens, the site-wide pause.
create function private.pause_ai_dispatch(seconds integer) returns void
language sql security definer set search_path = '' as $$
  insert into private.ai_soc_pause as p values (true, pg_catalog.clock_timestamp() + make_interval(secs => seconds))
    on conflict (id) do update set paused_until = greatest(p.paused_until, excluded.paused_until);
$$;
revoke all on function private.pause_ai_dispatch(integer) from public, anon, authenticated;

-- A pause is allowed only for a failed turn whose stored diagnostic says SoC
-- answered 429 or 503, and only for 5 to 600 seconds.
create function private.valid_pause(seconds integer, failure_code text, failure_diagnostic jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select seconds is null or coalesce(seconds between 5 and 600 and failure_code = 'upstream_http'
    and failure_diagnostic->>'http_status' in ('429', '503'), false);
$$;
revoke all on function private.valid_pause(integer, text, jsonb) from public, anon, authenticated;

-- The hourly chat refund now also gives back the user-day charge.
create or replace function private.refund_chat_charge(turn_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare charge timestamptz; owner uuid;
begin
  select t.charged_at, t.author_id into charge, owner from public.chat_turns t where t.id = turn_id for update;
  if charge is null then return; end if;
  update public.chat_turns set charged_at = null where id = turn_id;
  update private.chat_admission set charged = greatest(charged - 1, 0)
    where author_id = owner and started_at <= charge and started_at > clock_timestamp() - interval '1 hour';
  perform private.refund_ai_user_day(owner, charge);
end;
$$;

create function private.refund_test_plan_charge(turn_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare charge timestamptz; owner uuid;
begin
  select t.charged_at, t.developer_id into charge, owner from public.test_plan_turns t where t.id = turn_id for update;
  if charge is null then return; end if;
  update public.test_plan_turns set charged_at = null where id = turn_id;
  perform private.refund_ai_user_day(owner, charge);
end;
$$;
revoke all on function private.refund_test_plan_charge(uuid) from public, anon, authenticated;

-- PM assistant admission, unchanged except: caps are required, expired leases
-- refund the user day, and the shared limits are reserved just before charging.
drop function public.begin_chat_turn(uuid,uuid,uuid,uuid,integer,jsonb,text,boolean,text,jsonb);
create function public.begin_chat_turn(target_org uuid, request_id uuid, actor_id uuid, turn_key uuid,
  base_revision integer, input_fields jsonb, user_message text, retry_failed boolean default false,
  p_intent text default 'edit', p_answers jsonb default null, ai_limits jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item public.feature_requests; turn public.chat_turns; earlier public.chat_turns; admission_window private.chat_admission; history jsonb; expired uuid;
begin
  item := private.lock_chat_owner(target_org,request_id,actor_id);
  if turn_key is null or base_revision is null or retry_failed is null or not private.valid_request_fields(input_fields)
    or user_message is null or char_length(user_message) not between 1 and 4000 or user_message !~ '[^[:space:]]'
    or p_intent is null or p_intent not in ('draft','gaps','edit') or not private.valid_ai_answers(p_answers)
    or (p_answers is not null and p_intent <> 'edit') or not private.valid_ai_limits(ai_limits) then
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
  if (select coalesce(sum(octet_length(to_jsonb(t)::text)),0) from public.chat_turns t where t.request_id = begin_chat_turn.request_id and t.id is distinct from turn.id) + octet_length(input_fields::text) + octet_length(to_jsonb(user_message)::text) + octet_length(coalesce(p_answers::text,'')) + 202048 > 1048576 then
    raise exception 'Conversation capacity reached' using errcode = 'PT429';
  end if;
  perform private.reserve_ai_dispatch(target_org, actor_id, ai_limits);
  update private.chat_admission set started_at = admission_window.started_at, attempts = admission_window.attempts + 1, charged = admission_window.charged + 1 where author_id = actor_id;
  if turn.id is null then
    insert into public.chat_turns(request_id,organisation_id,author_id,turn_key,base_revision,input_fields,message,status,lease_until,intent,answers,charged_at)
    values(request_id,target_org,actor_id,turn_key,base_revision,input_fields,user_message,'running',clock_timestamp() + interval '120 seconds',p_intent,p_answers,clock_timestamp()) returning * into turn;
  else
    update public.chat_turns set status = 'running', generation = generation + 1, lease_until = clock_timestamp() + interval '120 seconds', error_code = null, diagnostic = null, charged_at = clock_timestamp()
      where id = turn.id returning * into turn;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('message',r.message,'reply',left(r.reply,1000)) order by r.created_at,r.id),'[]'::jsonb) into history
    from (select t.message, t.reply, t.created_at, t.id from public.chat_turns t
      where t.request_id = begin_chat_turn.request_id and t.id <> turn.id and t.status = 'completed'
      order by t.created_at desc, t.id desc limit 3) r;
  return jsonb_build_object('dispatch',true,'turn',to_jsonb(turn),'history',history);
end;
$$;
revoke all on function public.begin_chat_turn(uuid,uuid,uuid,uuid,integer,jsonb,text,boolean,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.begin_chat_turn(uuid,uuid,uuid,uuid,integer,jsonb,text,boolean,text,jsonb,jsonb) to service_role;

drop function public.finish_chat_turn(uuid,uuid,uuid,uuid,integer,text,jsonb,text,jsonb,jsonb);
create function public.finish_chat_turn(target_org uuid, request_id uuid, actor_id uuid, turn_id uuid,
  worker_generation integer, human_reply text, task_proposal jsonb, failure_code text, failure_diagnostic jsonb default null,
  task_questions jsonb default null, pause_seconds integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare turn public.chat_turns;
begin
  perform private.lock_chat_owner(target_org,request_id,actor_id);
  perform 1 from private.chat_admission where author_id = actor_id for update;
  select * into turn from public.chat_turns where id = turn_id and organisation_id = target_org and chat_turns.request_id = finish_chat_turn.request_id and author_id = actor_id for update;
  if not found or turn.status <> 'running' or turn.generation is distinct from worker_generation or turn.lease_until <= clock_timestamp() then raise exception 'Turn changed'; end if;
  if not private.valid_ai_diagnostic(failure_code,failure_diagnostic) then raise exception 'Invalid diagnostic' using errcode = '22023'; end if;
  if not private.valid_pause(pause_seconds,failure_code,failure_diagnostic) then raise exception 'Invalid pause' using errcode = '22023'; end if;
  if failure_code is null then
    if human_reply is null or char_length(human_reply) < 1 or human_reply !~ '[^[:space:]]' or (task_proposal is not null and not private.valid_request_fields(task_proposal,true))
      or not private.valid_ai_questions(task_questions) or (task_questions is not null and turn.intent <> 'gaps') or (task_proposal is not null and turn.intent = 'gaps') then raise exception 'Invalid output' using errcode = '22023'; end if;
  elsif failure_code not in ('unavailable','invalid_output','context_limit','interrupted','configuration','local_timeout','upstream_http','network_error') or human_reply is not null or task_proposal is not null or task_questions is not null then raise exception 'Invalid failure' using errcode = '22023'; end if;
  if (select coalesce(sum(octet_length(to_jsonb(t)::text)),0) from public.chat_turns t where t.request_id = finish_chat_turn.request_id and t.id <> turn_id)
    + octet_length((to_jsonb(turn) || jsonb_build_object('status',case when failure_code is null then 'completed' else 'failed' end,'reply',human_reply,'proposal',task_proposal,'questions',task_questions,'error_code',failure_code,'diagnostic',failure_diagnostic))::text) > 1048576 then
    raise exception 'Conversation capacity reached' using errcode = 'PT429';
  end if;
  if failure_code is not null then perform private.refund_chat_charge(turn.id); end if;
  if pause_seconds is not null then perform private.pause_ai_dispatch(pause_seconds); end if;
  update public.chat_turns set status = case when failure_code is null then 'completed' else 'failed' end,
    reply = human_reply, proposal = task_proposal, questions = task_questions, error_code = failure_code, diagnostic = failure_diagnostic,
    charged_at = case when failure_code is null then chat_turns.charged_at else null end
    where id = turn.id returning * into turn;
  return to_jsonb(turn);
end;
$$;
revoke all on function public.finish_chat_turn(uuid,uuid,uuid,uuid,integer,text,jsonb,text,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.finish_chat_turn(uuid,uuid,uuid,uuid,integer,text,jsonb,text,jsonb,jsonb,integer) to service_role;

-- Developer test plans: same shared limits, and the user day is refunded on
-- failure. The existing hourly limit stays a non-refunded attempt count.
drop function public.begin_test_plan_turn(uuid,uuid,uuid,uuid,integer,jsonb,text,boolean);
create function public.begin_test_plan_turn(target_org uuid, request_id uuid, actor_id uuid, turn_key uuid,
  base_revision integer, input_fields jsonb, focus_note text default null, retry_failed boolean default false,
  ai_limits jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item public.feature_requests; turn public.test_plan_turns; admission_window private.test_plan_admission; expired uuid;
begin
  item := private.lock_test_plan_developer(target_org,request_id,actor_id);
  if turn_key is null or base_revision is null or retry_failed is null or not private.valid_request_fields(input_fields)
    or (focus_note is not null and (char_length(focus_note) not between 1 and 500 or focus_note !~ '[^[:space:]]'))
    or not private.valid_ai_limits(ai_limits) then
    raise exception 'Invalid input' using errcode = '22023';
  end if;
  insert into private.test_plan_admission values(actor_id,clock_timestamp(),0) on conflict do nothing;
  select * into admission_window from private.test_plan_admission where developer_id = actor_id for update;
  for expired in update public.test_plan_turns set status = 'failed', error_code = 'interrupted'
      where developer_id = actor_id and status = 'running' and lease_until <= clock_timestamp() returning id loop
    perform private.refund_test_plan_charge(expired);
  end loop;
  select * into turn from public.test_plan_turns t
    where t.request_id = begin_test_plan_turn.request_id and t.turn_key = begin_test_plan_turn.turn_key for update;
  if found then
    if turn.developer_id <> actor_id or turn.input_fields <> input_fields or turn.base_revision <> base_revision
      or turn.focus is distinct from focus_note then raise exception 'Turn input changed' using errcode = '22023'; end if;
    if turn.status <> 'failed' or not retry_failed then return jsonb_build_object('dispatch',false,'turn',to_jsonb(turn)); end if;
  end if;
  if item.revision <> base_revision then raise exception 'Ticket revision changed'; end if;
  if exists(select 1 from public.test_plan_turns where developer_id = actor_id and status = 'running') then
    raise exception 'Another AI turn is running' using errcode = 'PT429';
  end if;
  if admission_window.started_at <= clock_timestamp() - interval '1 hour' then
    admission_window.started_at := clock_timestamp(); admission_window.attempts := 0;
  end if;
  if admission_window.attempts >= 20 then raise exception 'AI usage limit reached' using errcode = 'PT429'; end if;
  if (select coalesce(sum(octet_length(to_jsonb(t)::text)),0) from public.test_plan_turns t
      where t.request_id = begin_test_plan_turn.request_id and t.id is distinct from turn.id)
      + octet_length(input_fields::text) + octet_length(to_jsonb(coalesce(focus_note,''))::text) + 202048 > 1048576 then
    raise exception 'Stored plan capacity reached' using errcode = 'PT429';
  end if;
  perform private.reserve_ai_dispatch(target_org, actor_id, ai_limits);
  update private.test_plan_admission set started_at = admission_window.started_at, attempts = admission_window.attempts + 1
    where developer_id = actor_id;
  if turn.id is null then
    insert into public.test_plan_turns(request_id,organisation_id,developer_id,turn_key,base_revision,input_fields,focus,status,lease_until,charged_at)
    values(request_id,target_org,actor_id,turn_key,base_revision,input_fields,focus_note,'running',clock_timestamp() + interval '120 seconds',clock_timestamp())
    returning * into turn;
  else
    update public.test_plan_turns set status = 'running', generation = generation + 1,
      lease_until = clock_timestamp() + interval '120 seconds', error_code = null, diagnostic = null, reply = null, plan = null,
      charged_at = clock_timestamp()
      where id = turn.id returning * into turn;
  end if;
  return jsonb_build_object('dispatch',true,'turn',to_jsonb(turn));
end;
$$;
revoke all on function public.begin_test_plan_turn(uuid,uuid,uuid,uuid,integer,jsonb,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.begin_test_plan_turn(uuid,uuid,uuid,uuid,integer,jsonb,text,boolean,jsonb) to service_role;

drop function public.finish_test_plan_turn(uuid,uuid,uuid,uuid,integer,text,jsonb,text,jsonb);
create function public.finish_test_plan_turn(target_org uuid, request_id uuid, actor_id uuid, turn_id uuid,
  worker_generation integer, human_reply text, generated_plan jsonb, failure_code text, failure_diagnostic jsonb default null,
  pause_seconds integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare turn public.test_plan_turns;
begin
  perform private.lock_test_plan_developer(target_org,request_id,actor_id);
  select * into turn from public.test_plan_turns where id = turn_id and organisation_id = target_org
    and test_plan_turns.request_id = finish_test_plan_turn.request_id and developer_id = actor_id for update;
  if not found or turn.status <> 'running' or turn.generation is distinct from worker_generation
    or turn.lease_until <= clock_timestamp() then raise exception 'Turn changed'; end if;
  if not private.valid_ai_diagnostic(failure_code,failure_diagnostic) then raise exception 'Invalid diagnostic' using errcode = '22023'; end if;
  if not private.valid_pause(pause_seconds,failure_code,failure_diagnostic) then raise exception 'Invalid pause' using errcode = '22023'; end if;
  if failure_code is null then
    if human_reply is null or char_length(human_reply) not between 1 and 4000 or human_reply !~ '[^[:space:]]'
      or generated_plan is null or not private.valid_test_plan(generated_plan) then raise exception 'Invalid output' using errcode = '22023'; end if;
  elsif failure_code not in ('unavailable','invalid_output','context_limit','interrupted','configuration','local_timeout','upstream_http','network_error')
    or human_reply is not null or generated_plan is not null then raise exception 'Invalid failure' using errcode = '22023'; end if;
  if failure_code is not null then perform private.refund_test_plan_charge(turn.id); end if;
  if pause_seconds is not null then perform private.pause_ai_dispatch(pause_seconds); end if;
  update public.test_plan_turns set status = case when failure_code is null then 'completed' else 'failed' end,
    reply = human_reply, plan = generated_plan, error_code = failure_code, diagnostic = failure_diagnostic,
    charged_at = case when failure_code is null then test_plan_turns.charged_at else null end
    where id = turn.id returning * into turn;
  return to_jsonb(turn);
end;
$$;
revoke all on function public.finish_test_plan_turn(uuid,uuid,uuid,uuid,integer,text,jsonb,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.finish_test_plan_turn(uuid,uuid,uuid,uuid,integer,text,jsonb,text,jsonb,integer) to service_role;

-- The caller's own usage, now with their user-day count. No caps: the server
-- adds those. No parameter selects another user.
create or replace function public.read_ai_usage() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when a.author_id is null or a.started_at <= clock_timestamp() - interval '1 hour'
    then jsonb_build_object('remaining',20,'limit',20,'resets_at',null)
    else jsonb_build_object('remaining',greatest(20 - a.charged,0),'limit',20,'resets_at',a.started_at + interval '1 hour') end
    || jsonb_build_object('daily_used', private.ai_window_used('user', null, me.uid, 'day', private.sg_day_start(clock_timestamp())),
      'daily_resets_at', private.sg_day_start(clock_timestamp()) + interval '1 day')
  from (select auth.uid() as uid) me left join private.chat_admission a on a.author_id = me.uid
  where me.uid is not null;
$$;

-- An organisation's own daily total, for its verified admins only. Every other
-- caller, including for an organisation that does not exist, gets the same 42501.
create function public.read_organisation_ai_usage(target_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare day_start timestamptz := private.sg_day_start(pg_catalog.clock_timestamp());
begin
  if target_org is null or not private.is_admin(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return jsonb_build_object('used', private.ai_window_used('organisation', target_org, null, 'day', day_start),
    'resets_at', day_start + interval '1 day');
end;
$$;
revoke all on function public.read_organisation_ai_usage(uuid) from public, anon, authenticated, service_role;
revoke all on function public.read_ai_usage() from service_role;
grant execute on function public.read_organisation_ai_usage(uuid) to authenticated;
