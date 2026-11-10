begin;

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
    or (filters ? 'sort' and filters->>'sort' not in ('due','updated','status'))
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
    select r.*,row_number() over(order by case when filters->>'sort' = 'status' then
        case when r.submitted_at is null then 0
          else array_position(array['to_do','in_progress','in_review','cancelled','done'],r.status) end
      end,
      case when filters->>'sort' = 'due' then r.due_date end asc nulls last,r.updated_at desc,r.id) page_order
    from public.feature_requests r where r.organisation_id = target_org and (r.author_id = auth.uid() or r.submitted_at is not null)
      and (not (filters ? 'search') or strpos(lower(r.fields->>'title'),lower(filters->>'search')) > 0 or strpos(lower('SF-' || r.ticket_number),lower(filters->>'search')) > 0)
      and (not (filters ? 'status') or case when filters->>'status' = 'draft' then r.submitted_at is null else r.submitted_at is not null and r.status = filters->>'status' end)
      and (not (filters ? 'priority') or r.priority = filters->>'priority')
      and (not (filters ? 'assignee') or case filters->>'assignee' when 'me' then auth.uid() = any(r.assignee_ids) when 'unassigned' then cardinality(r.assignee_ids) = 0 else assigned = any(r.assignee_ids) end)
      and (coalesce(filters->>'overdue','false') <> 'true' or (r.submitted_at is not null and r.status not in ('done','cancelled') and r.due_date < today))
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
