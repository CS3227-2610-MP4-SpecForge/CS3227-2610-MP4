-- Public release check for GET /api/health. It proves the API can reach the
-- database with the publishable key, touches no table and returns no data.
create function public.health_check() returns boolean
language sql stable security invoker set search_path = ''
as $$ select true $$;
revoke all on function public.health_check() from public;
grant execute on function public.health_check() to anon, authenticated;
