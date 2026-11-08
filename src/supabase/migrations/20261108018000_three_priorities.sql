-- Normalize the retired value atomically without adding misleading user activity.
begin;
lock table public.feature_requests in access exclusive mode;
alter table public.feature_requests disable trigger record_ticket_activity;
update public.feature_requests set priority = 'high', delivery_revision = delivery_revision + 1, updated_at = clock_timestamp() where priority = 'urgent';
alter table public.feature_requests enable trigger record_ticket_activity;
alter table public.feature_requests drop constraint feature_requests_priority_check;
alter table public.feature_requests add constraint feature_requests_priority_check check(priority in ('low','medium','high'));

create or replace function public.update_delivery(target_org uuid, request_id uuid, expected_revision integer, changes jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item public.feature_requests; assigned uuid[]; parsed_date date;
begin
  perform 1 from public.organisations where id = target_org for update;
  if not private.is_member(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into item from public.feature_requests where id = request_id and organisation_id = target_org
    and (author_id = auth.uid() or submitted_at is not null) for update;
  if not found then raise exception 'Unavailable' using errcode = '42501'; end if;
  if changes is null or jsonb_typeof(changes) <> 'object' or changes = '{}'::jsonb
    or (changes - array['due_date','priority','assignee_ids','status']) <> '{}'::jsonb then
    raise exception 'Invalid changes' using errcode = '22023';
  end if;
  if item.author_id <> auth.uid() and
    (changes - 'status' <> '{}'::jsonb or not (auth.uid() = any(item.assignee_ids))) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if expected_revision is null or item.delivery_revision <> expected_revision then raise exception 'Delivery changed'; end if;
  if changes ? 'status' then
    if item.submitted_at is null or jsonb_typeof(changes->'status') <> 'string' or (changes->>'status') not in ('to_do','in_progress','in_review','done','cancelled') then
      raise exception 'Invalid status' using errcode = '22023';
    end if;
    item.status := changes->>'status';
  end if;
  if changes ? 'priority' then
    if jsonb_typeof(changes->'priority') <> 'string' or (changes->>'priority') not in ('low','medium','high') then raise exception 'Invalid priority' using errcode = '22023'; end if;
    item.priority := changes->>'priority';
  end if;
  if changes ? 'due_date' then
    if changes->'due_date' = 'null'::jsonb then parsed_date := null;
    else
      if jsonb_typeof(changes->'due_date') <> 'string' or (changes->>'due_date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date' using errcode = '22023'; end if;
      begin parsed_date := (changes->>'due_date')::date;
      exception when others then raise exception 'Invalid date' using errcode = '22023'; end;
      if not isfinite(parsed_date) or parsed_date < date '0001-01-01' or parsed_date > date '9999-12-31' then raise exception 'Invalid date' using errcode = '22023'; end if;
    end if;
    item.due_date := parsed_date;
  end if;
  if changes ? 'assignee_ids' then
    if jsonb_typeof(changes->'assignee_ids') <> 'array' or jsonb_array_length(changes->'assignee_ids') > 5 then raise exception 'Invalid assignees' using errcode = '22023'; end if;
    begin select coalesce(array_agg(value::uuid),'{}'::uuid[]) into assigned from jsonb_array_elements_text(changes->'assignee_ids');
    exception when others then raise exception 'Invalid assignees' using errcode = '22023'; end;
    if array_position(assigned,null) is not null or cardinality(assigned) <> (select count(distinct u) from unnest(assigned) u)
      or exists(select 1 from unnest(assigned) u where not exists(select 1 from public.organisation_members m where m.organisation_id = target_org and m.user_id = u)) then
      raise exception 'Invalid assignees' using errcode = '22023';
    end if;
    item.assignee_ids := assigned;
  end if;
  update public.feature_requests set due_date = item.due_date, priority = item.priority, status = item.status,
    assignee_ids = item.assignee_ids, delivery_revision = delivery_revision + 1, updated_at = clock_timestamp()
    where id = request_id returning * into item;
  return to_jsonb(item) - 'creation_key';
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
  select coalesce(jsonb_agg(to_jsonb(r) - array['creation_key','page_order'] order by r.page_order),'[]'::jsonb),count(*) into results,count_rows from (
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

commit;
