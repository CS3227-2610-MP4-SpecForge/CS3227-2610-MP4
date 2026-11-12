begin;

create function public.rename_username(new_username text) returns text
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
  if left(chosen_name, 7) = 'legacy_' then
    raise exception 'Invalid username' using errcode = '22023';
  end if;
  update public.profiles set username = chosen_name where id = auth.uid();
  if not found then
    raise exception 'Profile unavailable' using errcode = '42501';
  end if;
  return chosen_name;
end;
$$;
revoke all on function public.rename_username(text) from public, anon, authenticated;
grant execute on function public.rename_username(text) to authenticated;

commit;
