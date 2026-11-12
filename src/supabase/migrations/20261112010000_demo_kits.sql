begin;

-- Demo kits: a site-wide creation cap and the reserved demo_ username namespace.
-- Kit accounts are created by the server through the secret-key Admin API; the
-- only trusted marker is raw_app_meta_data.demo_kit, which clients cannot set.

create table private.demo_kit_windows (
  window_kind text not null check (window_kind in ('burst', 'daily')),
  window_start timestamptz not null,
  admitted integer not null check (admitted > 0),
  primary key (window_kind, window_start)
);
alter table private.demo_kit_windows enable row level security;
revoke all on table private.demo_kit_windows from public, anon, authenticated, service_role;

-- Reserves one creation slot in both windows, or names the full window and the
-- seconds until it ends. Time comes from the database clock; calls serialise.
create function public.reserve_demo_kit(burst_cap integer, daily_cap integer)
returns table(admitted boolean, limit_kind text, retry_after integer)
language plpgsql security definer set search_path = '' as $$
declare
  instant timestamptz := pg_catalog.clock_timestamp();
  burst_start timestamptz := date_bin(interval '10 minutes', instant, timestamptz '2000-01-01 00:00:00+00');
  daily_start timestamptz := date_trunc('day', instant at time zone 'Asia/Singapore') at time zone 'Asia/Singapore';
  used integer;
begin
  if burst_cap is null or daily_cap is null or burst_cap not between 0 and 5 or daily_cap not between 0 and 30 then
    raise exception 'Invalid demo kit limits' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(3227, 2610);
  select w.admitted into used from private.demo_kit_windows w
    where w.window_kind = 'daily' and w.window_start = daily_start;
  if coalesce(used, 0) >= daily_cap then
    return query select false, 'daily'::text,
      greatest(ceil(extract(epoch from daily_start + interval '1 day' - instant))::integer, 1);
    return;
  end if;
  select w.admitted into used from private.demo_kit_windows w
    where w.window_kind = 'burst' and w.window_start = burst_start;
  if coalesce(used, 0) >= burst_cap then
    return query select false, 'burst'::text,
      greatest(ceil(extract(epoch from burst_start + interval '10 minutes' - instant))::integer, 1);
    return;
  end if;
  insert into private.demo_kit_windows as w values ('burst', burst_start, 1), ('daily', daily_start, 1)
    on conflict (window_kind, window_start) do update set admitted = w.admitted + 1;
  delete from private.demo_kit_windows w where w.window_start < instant - interval '2 days';
  return query select true, null::text, 0;
end;
$$;
revoke all on function public.reserve_demo_kit(integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_demo_kit(integer, integer) to service_role;

-- True when a lowercased username is in the reserved demo namespace.
create function private.demo_username(chosen_name text) returns boolean
language sql immutable set search_path = '' as $$
  select left(chosen_name, 5) = 'demo_';
$$;
revoke all on function private.demo_username(text) from public, anon, authenticated;

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

-- Auth writes app_metadata after inserting the user, inside the same
-- transaction, so the demo rules are checked at commit against the final row.
-- Only the Admin API writes raw_app_meta_data; raw_user_meta_data is the caller's.
create function private.check_demo_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  marker jsonb;
  kit text;
  chosen_name text;
  chosen_role text;
begin
  select u.raw_app_meta_data->'demo_kit' into marker from auth.users u where u.id = new.id;
  if not found then return null; end if;
  select p.username, p.app_role into chosen_name, chosen_role from public.profiles p where p.id = new.id;
  if not found then return null; end if;
  if jsonb_typeof(marker) = 'string' then
    kit := marker #>> '{}';
    if kit collate "C" !~ '^[0-9a-f]{32}$'
      or chosen_name is distinct from
        (case chosen_role when 'PM' then 'demo_pm_' else 'demo_dev_' end) || left(kit, 8) then
      raise exception 'Invalid username' using errcode = '22023';
    end if;
  elsif marker is not null or private.demo_username(chosen_name) then
    raise exception 'Invalid username' using errcode = '22023';
  end if;
  return null;
end;
$$;
revoke all on function private.check_demo_profile() from public, anon, authenticated;
create constraint trigger check_demo_profile after insert on auth.users
  deferrable initially deferred for each row execute function private.check_demo_profile();

create or replace function public.rename_username(new_username text) returns text
language plpgsql security definer set search_path = '' as $$
declare chosen_name text;
begin
  if auth.uid() is null or not private.is_verified() then
    raise exception 'Verified account required' using errcode = '42501';
  end if;
  if new_username is null or new_username collate "C" !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'Invalid username' using errcode = '22023';
  end if;
  chosen_name := lower(new_username collate "C");
  if left(chosen_name, 7) = 'legacy_' or private.demo_username(chosen_name) then
    raise exception 'Invalid username' using errcode = '22023';
  end if;
  update public.profiles set username = chosen_name where id = auth.uid();
  if not found then
    raise exception 'Profile unavailable' using errcode = '42501';
  end if;
  return chosen_name;
end;
$$;

commit;
