create function public.publish_request(target_org uuid, request_id uuid, expected_revision integer, content jsonb, acknowledged boolean, first_submission boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item public.feature_requests;
begin
  item := private.lock_authored_request(target_org,request_id,expected_revision);
  if acknowledged is distinct from true or not private.valid_request_fields(content,true) then
    raise exception 'Complete fields and acknowledgement required' using errcode = '22023';
  end if;
  if first_submission is null then raise exception 'Invalid action' using errcode = '22023'; end if;
  if first_submission <> (item.submitted_at is null) then raise exception 'Publication state changed'; end if;
  update public.feature_requests set fields = content, revision = revision + 1,
    submitted_at = coalesce(submitted_at, clock_timestamp()), updated_at = clock_timestamp()
    where id = request_id returning * into item;
  return to_jsonb(item) - 'creation_key';
end;
$$;
revoke all on function public.publish_request(uuid,uuid,integer,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.publish_request(uuid,uuid,integer,jsonb,boolean,boolean) to authenticated;
