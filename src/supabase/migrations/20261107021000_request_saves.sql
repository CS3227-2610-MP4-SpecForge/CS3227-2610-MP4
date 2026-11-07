create function private.valid_request_fields(content jsonb, require_content boolean default false) returns boolean
language plpgsql immutable set search_path = '' as $$
declare field text; value text;
begin
  if content is null or jsonb_typeof(content) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(content)) <> 6 then return false; end if;
  foreach field in array array['title','problem','behaviour','acceptance','out_of_scope','assumptions'] loop
    if jsonb_typeof(content->field) is distinct from 'string' then return false; end if;
    value := content->>field;
    if char_length(value) > (case when field = 'title' then 160 else 4000 end) then return false; end if;
    if require_content and value !~ '[^[:space:]]' then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.valid_request_fields(jsonb,boolean) from public,anon,authenticated;
alter table public.feature_requests add constraint valid_request_content check(private.valid_request_fields(fields,submitted_at is not null));

-- All request mutations share lock ordering with member removal: organisation,
-- current identity/role/membership, then the authored request and revision.
create function private.lock_authored_request(target_org uuid, request_id uuid, expected_revision integer) returns public.feature_requests
language plpgsql security definer set search_path = '' as $$
declare item public.feature_requests;
begin
  perform 1 from public.organisations where id = target_org for update;
  if not private.is_member(target_org) or not exists(select 1 from public.profiles where id = auth.uid() and app_role = 'PM') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into item from public.feature_requests where id = request_id and organisation_id = target_org and author_id = auth.uid() for update;
  if not found then raise exception 'Request unavailable' using errcode = '42501'; end if;
  if expected_revision is null or item.revision <> expected_revision then raise exception 'Saved revision changed'; end if;
  return item;
end;
$$;
revoke all on function private.lock_authored_request(uuid,uuid,integer) from public,anon,authenticated;

create function public.save_draft(target_org uuid, request_id uuid, expected_revision integer, content jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item public.feature_requests;
begin
  item := private.lock_authored_request(target_org,request_id,expected_revision);
  if item.submitted_at is not null then raise exception 'Draft already submitted'; end if;
  if not private.valid_request_fields(content) then raise exception 'Invalid fields' using errcode = '22023'; end if;
  update public.feature_requests set fields = content, revision = revision + 1, updated_at = clock_timestamp()
    where id = request_id returning * into item;
  return to_jsonb(item) - 'creation_key';
end;
$$;
revoke all on function public.save_draft(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_draft(uuid,uuid,integer,jsonb) to authenticated;
