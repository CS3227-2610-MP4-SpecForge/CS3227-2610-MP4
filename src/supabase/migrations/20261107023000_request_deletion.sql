create function public.delete_draft(target_org uuid, request_id uuid, expected_revision integer) returns void
language plpgsql security definer set search_path = '' as $$
declare item public.feature_requests;
begin
  item := private.lock_authored_request(target_org,request_id,expected_revision);
  if item.submitted_at is not null then raise exception 'Submitted requests cannot be deleted'; end if;
  delete from public.feature_requests where id = request_id;
end;
$$;
revoke all on function public.delete_draft(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.delete_draft(uuid,uuid,integer) to authenticated;
