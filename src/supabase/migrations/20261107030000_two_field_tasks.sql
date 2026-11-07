-- Convert content without touching revision, identity, authorship or timestamps.
alter table public.feature_requests drop constraint valid_request_content;
update public.feature_requests set fields = jsonb_build_object(
  'title', fields->>'title',
  'description', case when (fields - 'title') = '{"problem":"","behaviour":"","acceptance":"","out_of_scope":"","assumptions":""}'::jsonb then '' else
    '## Problem description' || E'\n\n' || (fields->>'problem') || E'\n\n' ||
    '## Desired behaviour' || E'\n\n' || (fields->>'behaviour') || E'\n\n' ||
    '## Acceptance criteria' || E'\n\n' || (fields->>'acceptance') || E'\n\n' ||
    '## Out of scope' || E'\n\n' || (fields->>'out_of_scope') || E'\n\n' ||
    '## Assumptions / unresolved questions' || E'\n\n' || (fields->>'assumptions') end
);
alter table public.feature_requests alter column fields set default '{"title":"","description":""}'::jsonb;
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
    if char_length(value) > (case when field = 'title' then 160 else 24000 end) then return false; end if;
    if require_content and btrim(value,blanks) = '' then return false; end if;
  end loop;
  return true;
end;
$$;
alter table public.feature_requests add constraint valid_request_content check(private.valid_request_fields(fields,submitted_at is not null));
