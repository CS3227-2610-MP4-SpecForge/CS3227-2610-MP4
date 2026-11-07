create table public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  creation_key uuid not null,
  fields jsonb not null default '{"title":"","problem":"","behaviour":"","acceptance":"","out_of_scope":"","assumptions":""}'::jsonb,
  revision integer not null default 1 check(revision > 0),
  submitted_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(organisation_id,author_id,creation_key)
);
create index requests_organisation on public.feature_requests(organisation_id,updated_at desc);
alter table public.feature_requests enable row level security;
revoke all on public.feature_requests from anon, authenticated;
grant select on public.feature_requests to authenticated;
create policy request_visibility on public.feature_requests for select to authenticated
using(private.is_member(organisation_id) and (author_id = auth.uid() or submitted_at is not null));

create function public.create_request(target_org uuid, creation_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item public.feature_requests;
begin
  perform 1 from public.organisations where id = target_org for update;
  if not private.is_member(target_org) or not exists(select 1 from public.profiles where id = auth.uid() and app_role = 'PM') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if creation_key is null then raise exception 'Invalid creation key' using errcode = '22023'; end if;
  insert into public.feature_requests(organisation_id,author_id,creation_key)
  values(target_org,auth.uid(),creation_key) on conflict do nothing;
  select * into item from public.feature_requests r where r.organisation_id = target_org and r.author_id = auth.uid() and r.creation_key = create_request.creation_key;
  return to_jsonb(item) - 'creation_key';
end;
$$;

create function public.list_requests(target_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(r) - 'creation_key'),'[]'::jsonb) from (
    select * from public.feature_requests where organisation_id = target_org
      and (author_id = auth.uid() or submitted_at is not null)
    order by updated_at desc,id limit 100
  ) r);
end;
$$;

create function public.read_request(target_org uuid, request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item public.feature_requests;
begin
  if not private.is_member(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into item from public.feature_requests where id = request_id and organisation_id = target_org
    and (author_id = auth.uid() or submitted_at is not null);
  if not found then raise exception 'Request unavailable' using errcode = '42501'; end if;
  return to_jsonb(item) - 'creation_key';
end;
$$;
revoke all on function public.create_request(uuid,uuid),public.list_requests(uuid),public.read_request(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_request(uuid,uuid),public.list_requests(uuid),public.read_request(uuid,uuid) to authenticated;
