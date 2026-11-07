create table public.chat_turns (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.feature_requests(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  turn_key uuid not null,
  base_revision integer not null,
  input_fields jsonb not null check(private.valid_request_fields(input_fields)),
  message text not null check(char_length(message) between 1 and 4000),
  status text not null check(status in ('running','completed','failed')),
  generation integer not null default 1,
  lease_until timestamptz not null,
  reply text check(char_length(reply) between 1 and 4000),
  proposal jsonb check(proposal is null or private.valid_request_fields(proposal,true)),
  error_code text check(error_code in ('unavailable','invalid_output','context_limit','interrupted','configuration')),
  created_at timestamptz not null default clock_timestamp(),
  unique(request_id,turn_key)
);
create unique index one_request_turn on public.chat_turns(request_id) where status = 'running';
create unique index one_account_turn on public.chat_turns(author_id) where status = 'running';
create index chat_request_order on public.chat_turns(request_id,created_at,id);
create table private.chat_admission (
  author_id uuid primary key references public.profiles(id) on delete cascade,
  started_at timestamptz not null, attempts integer not null
);
revoke all on private.chat_admission from public,anon,authenticated;
create function private.is_request_author(target_org uuid, target_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_member(target_org) and exists(select 1 from public.feature_requests r join public.profiles p on p.id = r.author_id
    where r.id = target_request and r.organisation_id = target_org and r.author_id = auth.uid() and p.app_role = 'PM');
$$;
revoke all on function private.is_request_author(uuid,uuid) from public,anon,authenticated;
grant execute on function private.is_request_author(uuid,uuid) to authenticated;
alter table public.chat_turns enable row level security;
revoke all on public.chat_turns from public,anon,authenticated;
grant select on public.chat_turns to authenticated;
create policy own_chat on public.chat_turns for select to authenticated using(private.is_request_author(organisation_id,request_id));

create function public.read_chat(target_org uuid, request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_request_author(target_org,request_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]'::jsonb) from public.chat_turns t where t.organisation_id = target_org and t.request_id = read_chat.request_id);
end;
$$;
revoke all on function public.read_chat(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_chat(uuid,uuid) to authenticated;

-- Only the server worker role may admit/complete turns. Browser sessions cannot
-- forge completions, release an active lease, reset usage or dispatch a model.
create function private.lock_chat_owner(target_org uuid, target_request uuid, actor uuid) returns public.feature_requests
language plpgsql security definer set search_path = '' as $$
declare item public.feature_requests;
begin
  perform 1 from public.organisations where id = target_org for update;
  if not exists(select 1 from auth.users u join public.profiles p on p.id = u.id
      join public.organisation_members m on m.user_id = u.id
      where u.id = actor and u.email_confirmed_at is not null and p.app_role = 'PM' and m.organisation_id = target_org) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into item from public.feature_requests where id = target_request and organisation_id = target_org and author_id = actor for update;
  if not found then raise exception 'Not allowed' using errcode = '42501'; end if;
  return item;
end;
$$;
revoke all on function private.lock_chat_owner(uuid,uuid,uuid) from public,anon,authenticated;

create function public.begin_chat_turn(target_org uuid, request_id uuid, actor_id uuid, turn_key uuid,
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
  if (select coalesce(sum(octet_length(to_jsonb(t)::text)),0) from public.chat_turns t where t.request_id = begin_chat_turn.request_id) + octet_length(input_fields::text) + octet_length(user_message) > 1048576 then
    raise exception 'Conversation capacity reached' using errcode = 'PT429';
  end if;
  update private.chat_admission set started_at = admission_window.started_at, attempts = admission_window.attempts + 1 where author_id = actor_id;
  if turn.id is null then
    insert into public.chat_turns(request_id,organisation_id,author_id,turn_key,base_revision,input_fields,message,status,lease_until)
    values(request_id,target_org,actor_id,turn_key,base_revision,input_fields,user_message,'running',clock_timestamp() + interval '120 seconds') returning * into turn;
  else
    update public.chat_turns set status = 'running', generation = generation + 1, lease_until = clock_timestamp() + interval '120 seconds', error_code = null
      where id = turn.id returning * into turn;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('message',t.message,'reply',t.reply,'proposal',t.proposal) order by t.created_at,t.id),'[]'::jsonb) into history
    from public.chat_turns t where t.request_id = begin_chat_turn.request_id and t.id <> turn.id;
  return jsonb_build_object('dispatch',true,'turn',to_jsonb(turn),'history',history);
end;
$$;

create function public.finish_chat_turn(target_org uuid, request_id uuid, actor_id uuid, turn_id uuid,
  worker_generation integer, human_reply text, task_proposal jsonb, failure_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare turn public.chat_turns;
begin
  perform private.lock_chat_owner(target_org,request_id,actor_id);
  select * into turn from public.chat_turns where id = turn_id and organisation_id = target_org and chat_turns.request_id = finish_chat_turn.request_id and author_id = actor_id for update;
  if not found or turn.status <> 'running' or turn.generation is distinct from worker_generation or turn.lease_until <= clock_timestamp() then raise exception 'Turn changed'; end if;
  if failure_code is null then
    if human_reply is null or char_length(human_reply) not between 1 and 4000 or human_reply !~ '[^[:space:]]' or (task_proposal is not null and not private.valid_request_fields(task_proposal,true)) then raise exception 'Invalid output' using errcode = '22023'; end if;
  elsif failure_code not in ('unavailable','invalid_output','context_limit','interrupted','configuration') or human_reply is not null or task_proposal is not null then raise exception 'Invalid failure' using errcode = '22023'; end if;
  update public.chat_turns set status = case when failure_code is null then 'completed' else 'failed' end,
    reply = human_reply, proposal = task_proposal, error_code = failure_code where id = turn.id returning * into turn;
  return to_jsonb(turn);
end;
$$;
revoke all on function public.begin_chat_turn(uuid,uuid,uuid,uuid,integer,jsonb,text,boolean),public.finish_chat_turn(uuid,uuid,uuid,uuid,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.begin_chat_turn(uuid,uuid,uuid,uuid,integer,jsonb,text,boolean),public.finish_chat_turn(uuid,uuid,uuid,uuid,integer,text,jsonb,text) to service_role;
