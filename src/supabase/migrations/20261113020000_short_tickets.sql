-- Ticket descriptions hold at most 3,000 characters (workflow/specs/2026-11-13-short-tickets.md).
-- Existing longer text is disposable (user decision, 2026-11-13): descriptions,
-- AI turn snapshots and proposals are cut to 3,000 characters in place.
create or replace function private.valid_request_fields(content jsonb, require_content boolean default false) returns boolean
language plpgsql immutable set search_path = '' as $$
declare field text; value text;
  blanks constant text := chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32) || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if content is null or jsonb_typeof(content) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(content)) <> 2 then return false; end if;
  foreach field in array array['title','description'] loop
    if jsonb_typeof(content->field) is distinct from 'string' then return false; end if;
    value := content->>field;
    if char_length(value) > (case when field = 'title' then 160 else 3000 end) then return false; end if;
    if require_content and btrim(value,blanks) = '' then return false; end if;
  end loop;
  return true;
end;
$$;

create function pg_temp.trimmed(content jsonb) returns jsonb language sql immutable as $$
  select case when content is null or char_length(content->>'description') <= 3000 then content
    else jsonb_set(content, '{description}', to_jsonb(left(content->>'description', 3000))) end
$$;

-- A data fix, not an edit: no activity entries, revisions or timestamps change.
alter table public.feature_requests disable trigger user;
update public.feature_requests set fields = pg_temp.trimmed(fields) where char_length(fields->>'description') > 3000;
alter table public.feature_requests enable trigger user;
update public.chat_turns set input_fields = pg_temp.trimmed(input_fields), proposal = pg_temp.trimmed(proposal)
  where char_length(input_fields->>'description') > 3000 or char_length(proposal->>'description') > 3000;
update public.test_plan_turns set input_fields = pg_temp.trimmed(input_fields)
  where char_length(input_fields->>'description') > 3000;

-- Check constraints are not rechecked when their function changes, so prove every
-- stored row satisfies the new bound before relying on it.
do $$
begin
  if exists(select 1 from public.feature_requests where not private.valid_request_fields(fields, submitted_at is not null))
    or exists(select 1 from public.chat_turns where not private.valid_request_fields(input_fields)
      or (proposal is not null and not private.valid_request_fields(proposal, true)))
    or exists(select 1 from public.test_plan_turns where not private.valid_request_fields(input_fields)) then
    raise exception 'Stored ticket content exceeds the 3,000-character description limit';
  end if;
end;
$$;
