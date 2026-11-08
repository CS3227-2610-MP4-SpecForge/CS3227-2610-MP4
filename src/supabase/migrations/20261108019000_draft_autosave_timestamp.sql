alter table public.feature_requests
  add column last_autosaved_at timestamptz,
  add constraint published_ticket_has_no_autosave_timestamp
    check (submitted_at is null or last_autosaved_at is null);

create function private.record_draft_autosave() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Content saves advance revision. Delivery-only writes use delivery_revision.
  new.last_autosaved_at := case when new.submitted_at is null then new.updated_at end;
  return new;
end;
$$;
revoke all on function private.record_draft_autosave() from public,anon,authenticated;

create trigger record_draft_autosave
before update of revision, submitted_at on public.feature_requests
for each row when (old.revision is distinct from new.revision or old.submitted_at is distinct from new.submitted_at)
execute function private.record_draft_autosave();
