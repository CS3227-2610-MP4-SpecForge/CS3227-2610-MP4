-- Preserve the admin-only roster interface; order the bounded result by role/name.
create or replace function public.list_members(target_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(roster) order by roster.is_admin desc, roster.username collate "C", roster.user_id), '[]'::jsonb) from (
    select m.user_id, m.is_admin, u.email, p.app_role, p.username
    from public.organisation_members m
    join auth.users u on u.id = m.user_id join public.profiles p on p.id = m.user_id
    where m.organisation_id = target_org
    order by m.is_admin desc, p.username collate "C", m.user_id limit 100
  ) roster);
end;
$$;
revoke all on function public.list_members(uuid) from public, anon, authenticated;
grant execute on function public.list_members(uuid) to authenticated;
