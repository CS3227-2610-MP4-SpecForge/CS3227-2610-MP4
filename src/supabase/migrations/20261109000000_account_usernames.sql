begin;

-- Wait for in-flight signups before switching the profile trigger and schema.
lock table auth.users in share row exclusive mode;
alter table public.profiles add column username text;
with legacy as (
  select id, 'legacy_' || to_hex(row_number() over (order by id)) as username
  from public.profiles
)
update public.profiles p set username = legacy.username from legacy where p.id = legacy.id;

alter table public.profiles
  alter column username set not null,
  add constraint profiles_username_format check (username collate "C" ~ '^[a-z0-9_]{3,24}$'),
  add constraint profiles_username_unique unique (username);

create or replace function private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare chosen_name text := new.raw_user_meta_data->>'username';
begin
  if new.raw_user_meta_data->>'role' is null or new.raw_user_meta_data->>'role' not in ('PM', 'Developer') then
    raise exception 'Invalid application role';
  end if;
  if jsonb_typeof(new.raw_user_meta_data->'username') is distinct from 'string'
    or chosen_name collate "C" !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'Invalid username' using errcode = '22023';
  end if;
  chosen_name := lower(chosen_name collate "C");
  if left(chosen_name, 7) = 'legacy_' then
    raise exception 'Invalid username' using errcode = '22023';
  end if;
  insert into public.profiles(id, app_role, username) values (new.id, new.raw_user_meta_data->>'role', chosen_name);
  return new;
end;
$$;

commit;
