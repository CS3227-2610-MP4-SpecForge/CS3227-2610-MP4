begin;

-- Resolve assignment labels only inside the existing authorized read RPCs.
create function private.ticket_assignee_usernames(assignees uuid[]) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(p.username order by a.ordinality), '[]'::jsonb)
  from unnest(assignees) with ordinality a(user_id, ordinality)
  left join public.profiles p on p.id = a.user_id;
$$;
revoke all on function private.ticket_assignee_usernames(uuid[]) from public, anon, authenticated;

create or replace function public.read_request(target_org uuid, request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
  if not private.is_member(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select (to_jsonb(r) - 'creation_key') || jsonb_build_object(
    'author_username', p.username,
    'assignee_usernames', private.ticket_assignee_usernames(r.assignee_ids)
  ) into item from public.feature_requests r join public.profiles p on p.id = r.author_id
    where r.id = request_id and r.organisation_id = target_org and (r.author_id = auth.uid() or r.submitted_at is not null);
  if not found then raise exception 'Request unavailable' using errcode = '42501'; end if;
  return item;
end;
$$;

create or replace function public.list_ticket_page(target_org uuid,filters jsonb default '{}',page_offset integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare results jsonb; count_rows integer; today date; assigned uuid;
begin
  if not private.is_member(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if page_offset is null or page_offset < 0 or page_offset > 2147483597 or filters is null or jsonb_typeof(filters) <> 'object'
    or filters - array['search','status','priority','assignee','overdue','today','sort'] <> '{}'::jsonb
    or exists(select 1 from jsonb_each(filters) f where jsonb_typeof(f.value) <> 'string')
    or char_length(coalesce(filters->>'search','')) > 160
    or (filters ? 'status' and filters->>'status' not in ('draft','to_do','in_progress','in_review','done','cancelled'))
    or (filters ? 'priority' and filters->>'priority' not in ('low','medium','high'))
    or (filters ? 'sort' and filters->>'sort' not in ('due','updated'))
    or (filters ? 'overdue' and filters->>'overdue' not in ('true','false')) then raise exception 'Invalid filters' using errcode = '22023'; end if;
  if filters ? 'assignee' and filters->>'assignee' not in ('me','unassigned') then
    begin assigned := (filters->>'assignee')::uuid;
    exception when others then raise exception 'Invalid assignee' using errcode = '22023'; end;
  end if;
  if filters ? 'today' then
    if filters->>'today' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid day' using errcode = '22023'; end if;
    begin today := (filters->>'today')::date;
    exception when others then raise exception 'Invalid day' using errcode = '22023'; end;
    if not isfinite(today) or today < date '0001-01-01' or today > date '9999-12-31' then raise exception 'Invalid day' using errcode = '22023'; end if;
  end if;
  if filters->>'overdue' = 'true' and today is null then raise exception 'Viewer day required' using errcode = '22023'; end if;
  select coalesce(jsonb_agg((to_jsonb(r) - array['creation_key','page_order']) || jsonb_build_object(
    'author_username', (select username from public.profiles where id = r.author_id),
    'assignee_usernames', private.ticket_assignee_usernames(r.assignee_ids)
  ) order by r.page_order),'[]'::jsonb),count(*) into results,count_rows from (
    select r.*,row_number() over(order by case when filters->>'sort' = 'due' then r.due_date end asc nulls last,r.updated_at desc,r.id) page_order
    from public.feature_requests r where r.organisation_id = target_org and (r.author_id = auth.uid() or r.submitted_at is not null)
      and (not (filters ? 'search') or strpos(lower(r.fields->>'title'),lower(filters->>'search')) > 0 or strpos(lower('SF-' || r.ticket_number),lower(filters->>'search')) > 0)
      and (not (filters ? 'status') or case when filters->>'status' = 'draft' then r.submitted_at is null else r.submitted_at is not null and r.status = filters->>'status' end)
      and (not (filters ? 'priority') or r.priority = filters->>'priority')
      and (not (filters ? 'assignee') or case filters->>'assignee' when 'me' then auth.uid() = any(r.assignee_ids) when 'unassigned' then cardinality(r.assignee_ids) = 0 else assigned = any(r.assignee_ids) end)
      and (coalesce(filters->>'overdue','false') <> 'true' or (r.submitted_at is not null and r.status not in ('done','cancelled') and r.due_date < today))
    order by case when filters->>'sort' = 'due' then r.due_date end asc nulls last,r.updated_at desc,r.id offset page_offset limit 50
  ) r;
  return jsonb_build_object('items',results,'next_offset',case when count_rows = 50 then page_offset + 50 else null end);
end;
$$;

create or replace function public.ticket_members(target_org uuid,after_user uuid default null,member_search text default '',selected_users uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare members jsonb; selected_members jsonb; last_user uuid; count_rows integer;
begin
  if not private.is_member(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if member_search is null or char_length(member_search) > 160 or selected_users is null
    or cardinality(selected_users) > 5 or array_position(selected_users,null) is not null then
    raise exception 'Invalid member search' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.user_id),'[]'::jsonb),count(*) into members,count_rows from (
    select m.user_id,u.email,p.app_role,p.username from public.organisation_members m
      join public.profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id
      where m.organisation_id = target_org and (after_user is null or m.user_id > after_user)
        and strpos(lower(u.email),lower(member_search)) > 0 order by m.user_id limit 50
  ) m;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.user_id),'[]'::jsonb) into selected_members from (
    select m.user_id,u.email,p.app_role,p.username from public.organisation_members m
      join public.profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id
      where m.organisation_id = target_org and m.user_id = any(selected_users)
  ) m;
  last_user := (members->-1->>'user_id')::uuid;
  return jsonb_build_object('members',members,'selected_members',selected_members,'next_cursor',case when count_rows = 50 then last_user else null end);
end;
$$;

create or replace function public.read_ticket_activity(target_org uuid,request_id uuid,before_id bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare entries jsonb; last_id bigint; count_rows integer;
begin
  if not private.is_member(target_org) or not exists(select 1 from public.feature_requests r where r.id = request_id and r.organisation_id = target_org and r.submitted_at is not null) then raise exception 'Unavailable' using errcode = '42501'; end if;
  if before_id is not null and before_id <= 0 then raise exception 'Invalid cursor' using errcode = '22023'; end if;
  select coalesce(jsonb_agg((to_jsonb(a) - 'creation_key') || jsonb_build_object(
      'id', a.id::text,
      'actor_username', (select username from public.profiles where id = a.actor_id),
      'assignment_usernames', case when a.changes ? 'assignee_ids' then jsonb_build_object(
        'from', private.ticket_assignee_usernames(array(
          select value::uuid from jsonb_array_elements_text(a.changes #> '{assignee_ids,from}') with ordinality order by ordinality
        )),
        'to', private.ticket_assignee_usernames(array(
          select value::uuid from jsonb_array_elements_text(a.changes #> '{assignee_ids,to}') with ordinality order by ordinality
        ))
      ) end
    ) order by a.id desc),'[]'::jsonb),min(a.id),count(*)
    into entries,last_id,count_rows from (
      select * from public.ticket_activity a where a.request_id = read_ticket_activity.request_id and (before_id is null or a.id < before_id) order by a.id desc limit 50
    ) a;
  return jsonb_build_object('entries',entries,'next_cursor',case when count_rows = 50 then last_id::text else null end);
end;
$$;

commit;
