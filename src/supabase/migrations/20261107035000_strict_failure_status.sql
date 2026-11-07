-- Missing status must be false, never SQL NULL (CHECK permits NULL).
create or replace function private.valid_ai_diagnostic(code text, value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare expected text;
begin
  expected := case code when 'local_timeout' then 'local_deadline' when 'upstream_http' then 'upstream_http' when 'network_error' then 'network' else null end;
  if value is null then return expected is null; end if;
  if expected is null or jsonb_typeof(value) <> 'object' then return false; end if;
  if jsonb_typeof(value->'source') is distinct from 'string' or value->>'source' is distinct from expected then return false; end if;
  if jsonb_typeof(value->'elapsed_ms') is distinct from 'number' or (value->>'elapsed_ms') !~ '^(0|[1-9][0-9]{0,9})$' then return false; end if;
  if (value->>'elapsed_ms')::bigint > 2147483647 then return false; end if;
  if expected = 'upstream_http' then
    if jsonb_typeof(value->'http_status') is distinct from 'number' or (value->>'http_status') !~ '^[3-5][0-9]{2}$' then return false; end if;
    return (select count(*) from jsonb_object_keys(value)) = 3;
  end if;
  return (select count(*) from jsonb_object_keys(value)) = 2;
end;
$$;
