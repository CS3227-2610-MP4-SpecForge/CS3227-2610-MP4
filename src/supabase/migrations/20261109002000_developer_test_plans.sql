-- Developer-role AI: generated test plans for published tickets. Generation
-- mirrors private PM chat (worker-only admission, leases, generation fencing,
-- idempotent turn keys, per-account usage and per-ticket storage caps). The
-- saved plan is organisation-visible; generated turns stay private to their
-- developer until that developer explicitly saves one.

-- Single storage-side definition of a valid plan. The client and server share
-- the same caps from src/test-plans.ts; this is the authority.
create function private.valid_test_plan(plan jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare item jsonb; step jsonb; keys integer;
begin
  if plan is null or jsonb_typeof(plan) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(plan)) <> 1 or jsonb_typeof(plan->'cases') is distinct from 'array' then return false; end if;
  if jsonb_array_length(plan->'cases') not between 1 and 12 then return false; end if;
  for item in select * from jsonb_array_elements(plan->'cases') loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    select count(*) into keys from jsonb_object_keys(item);
    if keys < 4 or keys > 5 then return false; end if;
    if jsonb_typeof(item->'title') is distinct from 'string'
      or char_length(item->>'title') not between 1 and 160 or item->>'title' !~ '[^[:space:]]' then return false; end if;
    if jsonb_typeof(item->'kind') is distinct from 'string' or item->>'kind' not in ('happy','edge','failure') then return false; end if;
    if item ? 'preconditions' then
      if jsonb_typeof(item->'preconditions') is distinct from 'string' or char_length(item->>'preconditions') > 500 then return false; end if;
    elsif keys <> 4 then return false; end if;
    if jsonb_typeof(item->'expected') is distinct from 'string'
      or char_length(item->>'expected') not between 1 and 500 or item->>'expected' !~ '[^[:space:]]' then return false; end if;
    if jsonb_typeof(item->'steps') is distinct from 'array' or jsonb_array_length(item->'steps') not between 1 and 10 then return false; end if;
    for step in select * from jsonb_array_elements(item->'steps') loop
      if jsonb_typeof(step) is distinct from 'string'
        or char_length(step #>> '{}') not between 1 and 300 or step #>> '{}' !~ '[^[:space:]]' then return false; end if;
    end loop;
  end loop;
  return true;
end;
$$;
revoke all on function private.valid_test_plan(jsonb) from public,anon,authenticated;
grant execute on function private.valid_test_plan(jsonb) to authenticated,service_role;

create table public.test_plan_turns (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.feature_requests(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  developer_id uuid not null references public.profiles(id) on delete cascade,
  turn_key uuid not null,
  base_revision integer not null,
  input_fields jsonb not null check(private.valid_request_fields(input_fields)),
  focus text check(focus is null or char_length(focus) between 1 and 500),
  status text not null check(status in ('running','completed','failed')),
  generation integer not null default 1,
  lease_until timestamptz not null,
  reply text check(char_length(reply) between 1 and 4000),
  plan jsonb check(plan is null or private.valid_test_plan(plan)),
  error_code text check(error_code in ('unavailable','invalid_output','context_limit','interrupted','configuration','local_timeout','upstream_http','network_error')),
  diagnostic jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique(request_id,turn_key),
  constraint valid_test_plan_diagnostic check(private.valid_ai_diagnostic(error_code,diagnostic))
);
create unique index one_developer_test_plan_turn on public.test_plan_turns(developer_id) where status = 'running';
create index test_plan_turn_order on public.test_plan_turns(request_id,developer_id,created_at,id);

-- One saved plan per ticket. revision guards concurrent saves; ticket_revision
-- records the content the plan was generated against.
create table public.ticket_test_plans (
  request_id uuid primary key references public.feature_requests(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  plan jsonb not null check(private.valid_test_plan(plan)),
  revision integer not null default 1,
  ticket_revision integer not null,
  saved_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table private.test_plan_admission (
  developer_id uuid primary key references public.profiles(id) on delete cascade,
  started_at timestamptz not null, attempts integer not null
);
revoke all on private.test_plan_admission from public,anon,authenticated;

-- A developer member of the organisation, on a ticket that has been published.
create function private.is_ticket_developer(target_org uuid, target_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_member(target_org) and exists(
    select 1 from public.feature_requests r join public.profiles p on p.id = auth.uid()
    where r.id = target_request and r.organisation_id = target_org
      and r.submitted_at is not null and p.app_role = 'Developer');
$$;
revoke all on function private.is_ticket_developer(uuid,uuid) from public,anon,authenticated;
grant execute on function private.is_ticket_developer(uuid,uuid) to authenticated;

alter table public.test_plan_turns enable row level security;
revoke all on public.test_plan_turns from public,anon,authenticated;
grant select on public.test_plan_turns to authenticated;
create policy own_test_plan_turns on public.test_plan_turns for select to authenticated
  using(developer_id = auth.uid() and private.is_ticket_developer(organisation_id,request_id));

alter table public.ticket_test_plans enable row level security;
revoke all on public.ticket_test_plans from public,anon,authenticated;
grant select on public.ticket_test_plans to authenticated;
-- Saved plans are shared with the organisation, including Product Managers.
create policy member_test_plans on public.ticket_test_plans for select to authenticated
  using(private.is_member(organisation_id) and exists(
    select 1 from public.feature_requests r where r.id = request_id and r.organisation_id = ticket_test_plans.organisation_id and r.submitted_at is not null));

create function public.read_test_plan(target_org uuid, request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare saved jsonb; turns jsonb;
begin
  if not private.is_member(target_org) or not exists(select 1 from public.feature_requests r
      where r.id = read_test_plan.request_id and r.organisation_id = target_org and r.submitted_at is not null) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select to_jsonb(p) - 'organisation_id' || jsonb_build_object('saved_by_username',u.username) into saved
    from public.ticket_test_plans p join public.profiles u on u.id = p.saved_by where p.request_id = read_test_plan.request_id;
  if private.is_ticket_developer(target_org,read_test_plan.request_id) then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]'::jsonb) into turns
      from public.test_plan_turns t where t.request_id = read_test_plan.request_id and t.developer_id = auth.uid();
  else
    turns := '[]'::jsonb;
  end if;
  return jsonb_build_object('saved',saved,'turns',turns);
end;
$$;
revoke all on function public.read_test_plan(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_test_plan(uuid,uuid) to authenticated;

-- Worker-only generation. Browser sessions cannot admit a turn, complete one,
-- release an active lease or reset usage.
create function private.lock_test_plan_developer(target_org uuid, target_request uuid, actor uuid) returns public.feature_requests
language plpgsql security definer set search_path = '' as $$
declare item public.feature_requests;
begin
  perform 1 from public.organisations where id = target_org for update;
  if not exists(select 1 from auth.users u join public.profiles p on p.id = u.id
      join public.organisation_members m on m.user_id = u.id
      where u.id = actor and u.email_confirmed_at is not null and p.app_role = 'Developer' and m.organisation_id = target_org) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into item from public.feature_requests
    where id = target_request and organisation_id = target_org and submitted_at is not null for update;
  if not found then raise exception 'Not allowed' using errcode = '42501'; end if;
  return item;
end;
$$;
revoke all on function private.lock_test_plan_developer(uuid,uuid,uuid) from public,anon,authenticated;

create function public.begin_test_plan_turn(target_org uuid, request_id uuid, actor_id uuid, turn_key uuid,
  base_revision integer, input_fields jsonb, focus_note text default null, retry_failed boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item public.feature_requests; turn public.test_plan_turns; admission_window private.test_plan_admission;
begin
  item := private.lock_test_plan_developer(target_org,request_id,actor_id);
  if turn_key is null or base_revision is null or retry_failed is null or not private.valid_request_fields(input_fields)
    or (focus_note is not null and (char_length(focus_note) not between 1 and 500 or focus_note !~ '[^[:space:]]')) then
    raise exception 'Invalid input' using errcode = '22023';
  end if;
  insert into private.test_plan_admission values(actor_id,clock_timestamp(),0) on conflict do nothing;
  select * into admission_window from private.test_plan_admission where developer_id = actor_id for update;
  update public.test_plan_turns set status = 'failed', error_code = 'interrupted'
    where developer_id = actor_id and status = 'running' and lease_until <= clock_timestamp();
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
  -- Reserve metadata plus the worst escaped reply/plan before admitting. A retry
  -- replaces one row, so that row is not counted twice.
  if (select coalesce(sum(octet_length(to_jsonb(t)::text)),0) from public.test_plan_turns t
      where t.request_id = begin_test_plan_turn.request_id and t.id is distinct from turn.id)
      + octet_length(input_fields::text) + octet_length(to_jsonb(coalesce(focus_note,''))::text) + 202048 > 1048576 then
    raise exception 'Stored plan capacity reached' using errcode = 'PT429';
  end if;
  update private.test_plan_admission set started_at = admission_window.started_at, attempts = admission_window.attempts + 1
    where developer_id = actor_id;
  if turn.id is null then
    insert into public.test_plan_turns(request_id,organisation_id,developer_id,turn_key,base_revision,input_fields,focus,status,lease_until)
    values(request_id,target_org,actor_id,turn_key,base_revision,input_fields,focus_note,'running',clock_timestamp() + interval '120 seconds')
    returning * into turn;
  else
    update public.test_plan_turns set status = 'running', generation = generation + 1,
      lease_until = clock_timestamp() + interval '120 seconds', error_code = null, diagnostic = null, reply = null, plan = null
      where id = turn.id returning * into turn;
  end if;
  return jsonb_build_object('dispatch',true,'turn',to_jsonb(turn));
end;
$$;

create function public.finish_test_plan_turn(target_org uuid, request_id uuid, actor_id uuid, turn_id uuid,
  worker_generation integer, human_reply text, generated_plan jsonb, failure_code text, failure_diagnostic jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare turn public.test_plan_turns;
begin
  perform private.lock_test_plan_developer(target_org,request_id,actor_id);
  select * into turn from public.test_plan_turns where id = turn_id and organisation_id = target_org
    and test_plan_turns.request_id = finish_test_plan_turn.request_id and developer_id = actor_id for update;
  if not found or turn.status <> 'running' or turn.generation is distinct from worker_generation
    or turn.lease_until <= clock_timestamp() then raise exception 'Turn changed'; end if;
  if not private.valid_ai_diagnostic(failure_code,failure_diagnostic) then raise exception 'Invalid diagnostic' using errcode = '22023'; end if;
  if failure_code is null then
    if human_reply is null or char_length(human_reply) not between 1 and 4000 or human_reply !~ '[^[:space:]]'
      or generated_plan is null or not private.valid_test_plan(generated_plan) then raise exception 'Invalid output' using errcode = '22023'; end if;
  elsif failure_code not in ('unavailable','invalid_output','context_limit','interrupted','configuration','local_timeout','upstream_http','network_error')
    or human_reply is not null or generated_plan is not null then raise exception 'Invalid failure' using errcode = '22023'; end if;
  update public.test_plan_turns set status = case when failure_code is null then 'completed' else 'failed' end,
    reply = human_reply, plan = generated_plan, error_code = failure_code, diagnostic = failure_diagnostic
    where id = turn.id returning * into turn;
  return to_jsonb(turn);
end;
$$;
revoke all on function public.begin_test_plan_turn(uuid,uuid,uuid,uuid,integer,jsonb,text,boolean),
  public.finish_test_plan_turn(uuid,uuid,uuid,uuid,integer,text,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.begin_test_plan_turn(uuid,uuid,uuid,uuid,integer,jsonb,text,boolean),
  public.finish_test_plan_turn(uuid,uuid,uuid,uuid,integer,text,jsonb,text,jsonb) to service_role;

-- Saving is the developer's explicit decision, so it runs under their own
-- session. A plan generated against older ticket content is refused rather than
-- written over newer wording.
create function public.save_test_plan(target_org uuid, request_id uuid, plan jsonb,
  ticket_revision integer, expected_plan_revision integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item public.feature_requests; saved public.ticket_test_plans; current_revision integer;
begin
  if not private.is_ticket_developer(target_org,save_test_plan.request_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if plan is null or not private.valid_test_plan(plan) or ticket_revision is null then raise exception 'Invalid plan' using errcode = '22023'; end if;
  select * into item from public.feature_requests
    where id = save_test_plan.request_id and organisation_id = target_org and submitted_at is not null for update;
  if not found then raise exception 'Not allowed' using errcode = '42501'; end if;
  if item.revision <> ticket_revision then raise exception 'Ticket changed since the plan was generated'; end if;
  select * into saved from public.ticket_test_plans where ticket_test_plans.request_id = save_test_plan.request_id for update;
  current_revision := saved.revision;
  if current_revision is distinct from expected_plan_revision then raise exception 'Saved plan changed'; end if;
  if saved.request_id is null then
    insert into public.ticket_test_plans(request_id,organisation_id,plan,ticket_revision,saved_by)
    values(save_test_plan.request_id,target_org,plan,ticket_revision,auth.uid()) returning * into saved;
  else
    update public.ticket_test_plans set plan = save_test_plan.plan, revision = saved.revision + 1,
      ticket_revision = save_test_plan.ticket_revision, saved_by = auth.uid(), updated_at = clock_timestamp()
      where ticket_test_plans.request_id = save_test_plan.request_id returning * into saved;
  end if;
  return to_jsonb(saved) - 'organisation_id'
    || jsonb_build_object('saved_by_username',(select u.username from public.profiles u where u.id = saved.saved_by));
end;
$$;
revoke all on function public.save_test_plan(uuid,uuid,jsonb,integer,integer) from public,anon,authenticated;
grant execute on function public.save_test_plan(uuid,uuid,jsonb,integer,integer) to authenticated;
