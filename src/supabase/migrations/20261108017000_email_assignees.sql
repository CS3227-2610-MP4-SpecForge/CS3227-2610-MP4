drop function public.ticket_members(uuid,uuid,text);
create function public.ticket_members(target_org uuid,after_user uuid default null,member_search text default '',selected_users uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare members jsonb; selected_members jsonb; last_user uuid; count_rows integer;
begin
  if not private.is_member(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if member_search is null or char_length(member_search) > 160 or selected_users is null
    or cardinality(selected_users) > 5 or array_position(selected_users,null) is not null then
    raise exception 'Invalid member search' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.user_id),'[]'::jsonb),count(*) into members,count_rows from (
    select m.user_id,u.email,p.app_role from public.organisation_members m
      join public.profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id
      where m.organisation_id = target_org and (after_user is null or m.user_id > after_user)
        and strpos(lower(u.email),lower(member_search)) > 0 order by m.user_id limit 50
  ) m;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.user_id),'[]'::jsonb) into selected_members from (
    select m.user_id,u.email,p.app_role from public.organisation_members m
      join public.profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id
      where m.organisation_id = target_org and m.user_id = any(selected_users)
  ) m;
  last_user := (members->-1->>'user_id')::uuid;
  return jsonb_build_object('members',members,'selected_members',selected_members,'next_cursor',case when count_rows = 50 then last_user else null end);
end;
$$;
revoke all on function public.ticket_members(uuid,uuid,text,uuid[]) from public,anon,authenticated;
grant execute on function public.ticket_members(uuid,uuid,text,uuid[]) to authenticated;
