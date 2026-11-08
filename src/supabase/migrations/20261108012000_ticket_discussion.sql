create table public.ticket_activity (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.feature_requests(id) on delete cascade,
  actor_id uuid,
  kind text not null check(kind in ('published','delivery_updated','requirements_updated','comment')),
  body text,
  changes jsonb not null default '{}',
  creation_key uuid,
  created_at timestamptz not null default clock_timestamp(),
  unique(request_id,actor_id,creation_key)
);
create index ticket_activity_page on public.ticket_activity(request_id,id desc);
alter table public.ticket_activity enable row level security;
revoke all on public.ticket_activity from anon,authenticated;
grant select on public.ticket_activity to authenticated;
create policy published_ticket_activity on public.ticket_activity for select to authenticated using(
  exists(select 1 from public.feature_requests r where r.id = request_id and r.submitted_at is not null and private.is_member(r.organisation_id))
);
create function private.record_ticket_activity() returns trigger language plpgsql security definer set search_path = '' as $$
declare delta jsonb := '{}'; field text; before_value jsonb; after_value jsonb;
begin
  if new.submitted_at is null then return new; end if;
  if old.submitted_at is null then
    insert into public.ticket_activity(request_id,actor_id,kind) values(new.id,auth.uid(),'published');
    return new;
  end if;
  foreach field in array array['due_date','priority','status','assignee_ids'] loop
    before_value := to_jsonb(old)->field; after_value := to_jsonb(new)->field;
    if before_value is distinct from after_value then delta := delta || jsonb_build_object(field,jsonb_build_object('from',before_value,'to',after_value)); end if;
  end loop;
  if delta <> '{}'::jsonb then insert into public.ticket_activity(request_id,actor_id,kind,changes) values(new.id,auth.uid(),'delivery_updated',delta); end if;
  if old.fields is distinct from new.fields then insert into public.ticket_activity(request_id,actor_id,kind) values(new.id,auth.uid(),'requirements_updated'); end if;
  return new;
end;
$$;
create trigger record_ticket_activity after update on public.feature_requests for each row execute function private.record_ticket_activity();
revoke all on function private.record_ticket_activity() from public,anon,authenticated;

create table private.comment_admission (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null,
  attempts integer not null,
  primary key(organisation_id,actor_id)
);
create function public.comment_ticket(target_org uuid,request_id uuid,creation_key uuid,body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare entry public.ticket_activity; window_start timestamptz; admitted integer;
  blanks constant text := chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32) || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  perform 1 from public.organisations where id = target_org for update;
  if not private.is_member(target_org) or not exists(select 1 from public.feature_requests r where r.id = request_id and r.organisation_id = target_org and r.submitted_at is not null) then
    raise exception 'Unavailable' using errcode = '42501';
  end if;
  if creation_key is null or body is null or char_length(body) > 4000 or btrim(body,blanks) = '' then raise exception 'Invalid comment' using errcode = '22023'; end if;
  select * into entry from public.ticket_activity a where a.request_id = comment_ticket.request_id and a.actor_id = auth.uid() and a.creation_key = comment_ticket.creation_key;
  if found then
    if entry.body is distinct from body then raise exception 'Comment key reused'; end if;
    return (to_jsonb(entry) - 'creation_key') || jsonb_build_object('id',entry.id::text);
  end if;
  select started_at,attempts into window_start,admitted from private.comment_admission where organisation_id = target_org and actor_id = auth.uid();
  if window_start is null or window_start <= clock_timestamp() - interval '1 minute' then
    insert into private.comment_admission values(target_org,auth.uid(),clock_timestamp(),1)
    on conflict(organisation_id,actor_id) do update set started_at = excluded.started_at,attempts = 1;
  else
    if admitted >= 20 then raise exception 'Comment limit' using errcode = 'P0002'; end if;
    update private.comment_admission set attempts = attempts + 1 where organisation_id = target_org and actor_id = auth.uid();
  end if;
  insert into public.ticket_activity(request_id,actor_id,kind,body,creation_key) values(request_id,auth.uid(),'comment',body,creation_key) returning * into entry;
  return (to_jsonb(entry) - 'creation_key') || jsonb_build_object('id',entry.id::text);
end;
$$;
create function public.read_ticket_activity(target_org uuid,request_id uuid,before_id bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare entries jsonb; last_id bigint; count_rows integer;
begin
  if not private.is_member(target_org) or not exists(select 1 from public.feature_requests r where r.id = request_id and r.organisation_id = target_org and r.submitted_at is not null) then raise exception 'Unavailable' using errcode = '42501'; end if;
  if before_id is not null and before_id <= 0 then raise exception 'Invalid cursor' using errcode = '22023'; end if;
  select coalesce(jsonb_agg((to_jsonb(a) - 'creation_key') || jsonb_build_object('id',a.id::text) order by a.id desc),'[]'::jsonb),min(a.id),count(*)
    into entries,last_id,count_rows from (
      select * from public.ticket_activity a where a.request_id = read_ticket_activity.request_id and (before_id is null or a.id < before_id) order by a.id desc limit 50
    ) a;
  return jsonb_build_object('entries',entries,'next_cursor',case when count_rows = 50 then last_id::text else null end);
end;
$$;
revoke all on function public.comment_ticket(uuid,uuid,uuid,text),public.read_ticket_activity(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.comment_ticket(uuid,uuid,uuid,text),public.read_ticket_activity(uuid,uuid,bigint) to authenticated;
