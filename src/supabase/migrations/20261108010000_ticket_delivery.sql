-- Separate delivery revisions keep scheduling independent of content autosave/AI.
alter table public.feature_requests
  add column ticket_number integer,
  add column delivery_revision integer not null default 1 check(delivery_revision > 0),
  add column due_date date check(due_date is null or (isfinite(due_date) and due_date between date '0001-01-01' and date '9999-12-31')),
  add column priority text not null default 'medium' check(priority in ('low','medium','high','urgent')),
  add column status text not null default 'to_do' check(status in ('to_do','in_progress','in_review','done','cancelled')),
  add column assignee_ids uuid[] not null default '{}' check(cardinality(assignee_ids) <= 5 and array_position(assignee_ids,null) is null);
with numbered as (
  select id,row_number() over(partition by organisation_id order by created_at,id)::integer n from public.feature_requests
) update public.feature_requests r set ticket_number = n from numbered where numbered.id = r.id;
alter table public.feature_requests alter column ticket_number set not null;
alter table public.feature_requests add unique(organisation_id,ticket_number);
create table private.ticket_counters (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  last_number integer not null
);
insert into private.ticket_counters select organisation_id,max(ticket_number) from public.feature_requests group by organisation_id;
create function private.number_ticket() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.ticket_counters values(new.organisation_id,1)
  on conflict(organisation_id) do update set last_number = private.ticket_counters.last_number + 1
  returning last_number into new.ticket_number;
  return new;
end;
$$;
create trigger number_ticket before insert on public.feature_requests for each row execute function private.number_ticket();
revoke all on function private.number_ticket() from public,anon,authenticated;

create function public.update_delivery(target_org uuid, request_id uuid, expected_revision integer, changes jsonb) returns jsonb
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
    if jsonb_typeof(changes->'priority') <> 'string' or (changes->>'priority') not in ('low','medium','high','urgent') then raise exception 'Invalid priority' using errcode = '22023'; end if;
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
    if parsed_date is null and item.submitted_at is not null then raise exception 'Published deadline required' using errcode = '22023'; end if;
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
revoke all on function public.update_delivery(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.update_delivery(uuid,uuid,integer,jsonb) to authenticated;
