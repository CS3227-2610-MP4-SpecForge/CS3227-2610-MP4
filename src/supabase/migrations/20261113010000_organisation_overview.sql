begin;

-- Shared ticket predicates, so the overview counts and the Requests filters can
-- never disagree. "Open" is a published ticket that is not done or cancelled.
create function private.viewer_day(value text) returns date
language plpgsql immutable set search_path = '' as $$
declare day date;
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid day' using errcode = '22023'; end if;
  begin day := value::date;
  exception when others then raise exception 'Invalid day' using errcode = '22023'; end;
  if not isfinite(day) or day < date '0001-01-01' or day > date '9999-12-31' then
    raise exception 'Invalid day' using errcode = '22023';
  end if;
  return day;
end;
$$;
create function private.ticket_open(submitted_at timestamptz, status text) returns boolean
language sql immutable set search_path = '' as $$
  select submitted_at is not null and status in ('to_do','in_progress','in_review');
$$;
create function private.ticket_overdue(submitted_at timestamptz, status text, due_date date, today date) returns boolean
language sql immutable set search_path = '' as $$
  select private.ticket_open(submitted_at, status) and due_date < today;
$$;
create function private.ticket_due_soon(submitted_at timestamptz, status text, due_date date, today date) returns boolean
language sql immutable set search_path = '' as $$
  select private.ticket_open(submitted_at, status) and due_date >= today and due_date <= today + 6;
$$;
revoke all on function private.viewer_day(text), private.ticket_open(timestamptz,text),
  private.ticket_overdue(timestamptz,text,date,date), private.ticket_due_soon(timestamptz,text,date,date)
  from public, anon, authenticated;
grant execute on function private.viewer_day(text), private.ticket_open(timestamptz,text),
  private.ticket_overdue(timestamptz,text,date,date), private.ticket_due_soon(timestamptz,text,date,date)
  to authenticated;

-- Read-only aggregates for one organisation. Totals count each published
-- ticket once; workload rows count a ticket once for each of its assignees and
-- are never summed. Only the caller's own drafts are counted, in `mine`.
create function public.organisation_overview(target_org uuid, viewer_day text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare today date; totals jsonb; mine jsonb; members jsonb; member_total integer; unassigned jsonb; is_pm boolean;
begin
  if not private.is_member(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  today := private.viewer_day(viewer_day);
  select jsonb_build_object(
      'to_do', count(*) filter (where status = 'to_do'),
      'in_progress', count(*) filter (where status = 'in_progress'),
      'in_review', count(*) filter (where status = 'in_review'),
      'done', count(*) filter (where status = 'done'),
      'cancelled', count(*) filter (where status = 'cancelled'),
      'overdue', count(*) filter (where private.ticket_overdue(submitted_at, status, due_date, today)),
      'due_soon', count(*) filter (where private.ticket_due_soon(submitted_at, status, due_date, today))),
    jsonb_build_object(
      'open', count(*) filter (where private.ticket_open(submitted_at, status)
        and cardinality(assignee_ids) = 0),
      'overdue', count(*) filter (where private.ticket_overdue(submitted_at, status, due_date, today)
        and cardinality(assignee_ids) = 0),
      'high', count(*) filter (where private.ticket_open(submitted_at, status) and priority = 'high'
        and cardinality(assignee_ids) = 0))
    into totals, unassigned
    from public.feature_requests where organisation_id = target_org and submitted_at is not null;

  select app_role = 'PM' into is_pm from public.profiles where id = auth.uid();
  select jsonb_build_object(
      'open', count(*) filter (where private.ticket_open(submitted_at, status) and auth.uid() = any(assignee_ids)),
      'overdue', count(*) filter (where private.ticket_overdue(submitted_at, status, due_date, today)
        and auth.uid() = any(assignee_ids)))
    || case when is_pm then jsonb_build_object('drafts',
      count(*) filter (where submitted_at is null and author_id = auth.uid())) else '{}'::jsonb end
    into mine
    from public.feature_requests where organisation_id = target_org
      and (submitted_at is not null or author_id = auth.uid());

  with load as (
    select a.user_id,
      count(*) filter (where private.ticket_open(r.submitted_at, r.status)) as open,
      count(*) filter (where private.ticket_overdue(r.submitted_at, r.status, r.due_date, today)) as overdue,
      count(*) filter (where private.ticket_open(r.submitted_at, r.status) and r.priority = 'high') as high
    from public.feature_requests r cross join lateral unnest(r.assignee_ids) as a(user_id)
    where r.organisation_id = target_org and r.submitted_at is not null
    group by a.user_id
  ), member_rows as (
    select m.user_id, p.username, p.app_role,
      coalesce(l.open, 0) as open, coalesce(l.overdue, 0) as overdue, coalesce(l.high, 0) as high
    from public.organisation_members m
    join public.profiles p on p.id = m.user_id
    left join load l on l.user_id = m.user_id
    where m.organisation_id = target_org
  )
  select coalesce((select jsonb_agg(to_jsonb(top) order by top.open desc, top.username)
      from (select * from member_rows order by open desc, username limit 100) top), '[]'::jsonb),
    (select count(*) from member_rows)
    into members, member_total;

  return jsonb_build_object('totals', totals, 'mine', mine,
    'workload', jsonb_build_object('members', members, 'member_total', member_total, 'unassigned', unassigned));
end;
$$;
revoke all on function public.organisation_overview(uuid, text) from public, anon, authenticated;
grant execute on function public.organisation_overview(uuid, text) to authenticated;

-- The status filter gains open, overdue and due_soon, using the same predicates
-- as the overview so every count matches the list it links to. Overdue and
-- due_soon need the viewer's day. Everything else is unchanged.
create or replace function public.list_ticket_page(target_org uuid,filters jsonb default '{}',page_offset integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare results jsonb; count_rows integer; today date; assigned uuid;
begin
  if not private.is_member(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if page_offset is null or page_offset < 0 or page_offset > 2147483597 or filters is null or jsonb_typeof(filters) <> 'object'
    or filters - array['search','status','priority','assignee','overdue','today','sort'] <> '{}'::jsonb
    or exists(select 1 from jsonb_each(filters) f where jsonb_typeof(f.value) <> 'string')
    or char_length(coalesce(filters->>'search','')) > 160
    or (filters ? 'status' and filters->>'status' not in
      ('draft','open','overdue','due_soon','to_do','in_progress','in_review','done','cancelled'))
    or (filters ? 'priority' and filters->>'priority' not in ('low','medium','high'))
    or (filters ? 'sort' and filters->>'sort' not in ('due','updated','status'))
    or (filters ? 'overdue' and filters->>'overdue' not in ('true','false')) then raise exception 'Invalid filters' using errcode = '22023'; end if;
  if filters ? 'assignee' and filters->>'assignee' not in ('me','unassigned') then
    begin assigned := (filters->>'assignee')::uuid;
    exception when others then raise exception 'Invalid assignee' using errcode = '22023'; end;
  end if;
  if filters ? 'today' then today := private.viewer_day(filters->>'today'); end if;
  if (filters->>'overdue' = 'true' or filters->>'status' in ('overdue','due_soon')) and today is null then
    raise exception 'Viewer day required' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg((to_jsonb(r) - array['creation_key','page_order']) || jsonb_build_object(
    'author_username', (select username from public.profiles where id = r.author_id),
    'assignee_usernames', private.ticket_assignee_usernames(r.assignee_ids)
  ) order by r.page_order),'[]'::jsonb),count(*) into results,count_rows from (
    select r.*,row_number() over(order by case when filters->>'sort' = 'status' then
        case when r.submitted_at is null then 0
          else array_position(array['to_do','in_progress','in_review','cancelled','done'],r.status) end
      end,
      case when filters->>'sort' = 'due' then r.due_date end asc nulls last,r.updated_at desc,r.id) page_order
    from public.feature_requests r where r.organisation_id = target_org and (r.author_id = auth.uid() or r.submitted_at is not null)
      and (not (filters ? 'search') or strpos(lower(r.fields->>'title'),lower(filters->>'search')) > 0 or strpos(lower('SF-' || r.ticket_number),lower(filters->>'search')) > 0)
      and (not (filters ? 'status') or case filters->>'status'
        when 'draft' then r.submitted_at is null
        when 'open' then private.ticket_open(r.submitted_at,r.status)
        when 'overdue' then coalesce(private.ticket_overdue(r.submitted_at,r.status,r.due_date,today),false)
        when 'due_soon' then coalesce(private.ticket_due_soon(r.submitted_at,r.status,r.due_date,today),false)
        else r.submitted_at is not null and r.status = filters->>'status' end)
      and (not (filters ? 'priority') or r.priority = filters->>'priority')
      and (not (filters ? 'assignee') or case filters->>'assignee' when 'me' then auth.uid() = any(r.assignee_ids) when 'unassigned' then cardinality(r.assignee_ids) = 0 else assigned = any(r.assignee_ids) end)
      and (coalesce(filters->>'overdue','false') <> 'true'
        or coalesce(private.ticket_overdue(r.submitted_at,r.status,r.due_date,today),false))
    order by case when filters->>'sort' = 'status' then
        case when r.submitted_at is null then 0
          else array_position(array['to_do','in_progress','in_review','cancelled','done'],r.status) end
      end,
      case when filters->>'sort' = 'due' then r.due_date end asc nulls last,r.updated_at desc,r.id offset page_offset limit 50
  ) r;
  return jsonb_build_object('items',results,'next_offset',case when count_rows = 50 then page_offset + 50 else null end);
end;
$$;

commit;
