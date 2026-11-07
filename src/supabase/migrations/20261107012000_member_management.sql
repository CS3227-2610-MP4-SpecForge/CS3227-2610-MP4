create function public.change_member(target_org uuid, target_user uuid, decision text) returns void
language plpgsql security definer set search_path = '' as $$
declare admin_status boolean;
begin
  perform 1 from public.organisations where id = target_org for update;
  if not private.is_member(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if decision is null or decision not in ('remove','promote','demote','leave') then raise exception 'Invalid decision' using errcode = '22023'; end if;
  if decision = 'leave' then
    if target_user is distinct from auth.uid() then raise exception 'Not allowed' using errcode = '42501'; end if;
  elsif not private.is_admin(target_org) then raise exception 'Not allowed' using errcode = '42501';
  end if;
  select is_admin into admin_status from public.organisation_members where organisation_id = target_org and user_id = target_user;
  if not found then raise exception 'Member no longer available'; end if;
  if admin_status and decision <> 'promote' and
    (select count(*) from public.organisation_members where organisation_id = target_org and is_admin) <= 1 then
    raise exception 'Promote another member before the last admin leaves or loses admin status';
  end if;
  if decision in ('remove','leave') then
    delete from public.organisation_members where organisation_id = target_org and user_id = target_user;
  else
    update public.organisation_members set is_admin = (decision = 'promote') where organisation_id = target_org and user_id = target_user;
  end if;
end;
$$;

create function public.list_members(target_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from (
    select m.user_id, m.is_admin, u.email, p.app_role from public.organisation_members m
    join auth.users u on u.id = m.user_id join public.profiles p on p.id = m.user_id
    where m.organisation_id = target_org order by m.joined_at, m.user_id limit 100
  ) m);
end;
$$;
revoke all on function public.change_member(uuid,uuid,text), public.list_members(uuid) from public, anon, authenticated;
grant execute on function public.change_member(uuid,uuid,text), public.list_members(uuid) to authenticated;
