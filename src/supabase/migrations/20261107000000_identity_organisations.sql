-- Fixed application roles and member-scoped organisations. No administrative
-- credential is required by ordinary application operations.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  app_role text not null check (app_role in ('PM', 'Developer')),
  created_at timestamptz not null default now()
);
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80 and name = btrim(name)),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.organisation_members (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_admin boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);
create index organisation_members_user on public.organisation_members(user_id);

alter table public.profiles enable row level security;
alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
revoke all on public.profiles, public.organisations, public.organisation_members from anon, authenticated;
grant select on public.profiles, public.organisations, public.organisation_members to authenticated;

create function private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_user_meta_data->>'role' is null or new.raw_user_meta_data->>'role' not in ('PM', 'Developer') then
    raise exception 'Invalid application role';
  end if;
  insert into public.profiles(id, app_role) values (new.id, new.raw_user_meta_data->>'role');
  return new;
end;
$$;
revoke all on function private.create_profile() from public, anon, authenticated;
create trigger create_application_profile after insert on auth.users
for each row execute function private.create_profile();

create function private.is_verified() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null);
$$;
create function private.is_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_verified() and exists(
    select 1 from public.organisation_members where organisation_id = target and user_id = auth.uid()
  );
$$;
revoke all on function private.is_verified(), private.is_member(uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_verified(), private.is_member(uuid) to authenticated;

create policy own_profile on public.profiles for select to authenticated
using (id = (select auth.uid()) and (select private.is_verified()));
create policy member_organisations on public.organisations for select to authenticated
using (private.is_member(id));
create policy member_memberships on public.organisation_members for select to authenticated
using (private.is_member(organisation_id));

create function public.create_organisation(organisation_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid; actor uuid := auth.uid();
begin
  if actor is null or not private.is_verified() then
    raise exception 'Verified identity required' using errcode = '42501';
  end if;
  if organisation_name is null or char_length(btrim(organisation_name)) not between 1 and 80 then
    raise exception 'Invalid organisation name' using errcode = '22023';
  end if;
  insert into public.organisations(name, created_by) values (btrim(organisation_name), actor) returning id into new_id;
  insert into public.organisation_members(organisation_id, user_id, is_admin) values (new_id, actor, true);
  return new_id;
end;
$$;
revoke all on function public.create_organisation(text) from public, anon, authenticated;
grant execute on function public.create_organisation(text) to authenticated;
