create function private.require_ticket_deadline() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.submitted_at is null and new.submitted_at is not null and new.due_date is null then
    raise exception 'Deadline required for publication' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger require_ticket_deadline before update on public.feature_requests for each row execute function private.require_ticket_deadline();
revoke all on function private.require_ticket_deadline() from public,anon,authenticated;

create function private.unassign_departed_member() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.organisations where id = old.organisation_id for update;
  update public.feature_requests set assignee_ids = array_remove(assignee_ids,old.user_id),
    delivery_revision = delivery_revision + 1, updated_at = clock_timestamp()
    where organisation_id = old.organisation_id and old.user_id = any(assignee_ids);
  return old;
end;
$$;
create trigger unassign_departed_member before delete on public.organisation_members for each row execute function private.unassign_departed_member();
revoke all on function private.unassign_departed_member() from public,anon,authenticated;
