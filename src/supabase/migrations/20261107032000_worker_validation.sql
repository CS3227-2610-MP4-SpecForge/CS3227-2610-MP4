-- The trusted worker/fixture role may validate constrained rows during private
-- administrative maintenance. This grants no writes or function access to users.
grant usage on schema private to service_role;
grant execute on function private.valid_request_fields(jsonb,boolean) to service_role;
