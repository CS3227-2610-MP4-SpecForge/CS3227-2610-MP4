-- Compose existing authorized mutations in one transaction. Any exception rolls
-- back delivery, content and activity together. Keep legacy interfaces intact.
create function public.save_ticket(target_org uuid, request_id uuid,
  expected_revision integer, expected_delivery_revision integer, content jsonb,
  delivery_changes jsonb, action text, acknowledged boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item public.feature_requests;
begin
  item := private.lock_authored_request(target_org,request_id,expected_revision);
  if expected_delivery_revision is null or item.delivery_revision <> expected_delivery_revision then
    raise exception 'Delivery changed';
  end if;
  if action is null or action not in ('save_draft','submit','save_published')
    or delivery_changes is null or jsonb_typeof(delivery_changes) <> 'object' then
    raise exception 'Invalid ticket save' using errcode = '22023';
  end if;
  if delivery_changes <> '{}'::jsonb then
    perform public.update_delivery(target_org,request_id,expected_delivery_revision,delivery_changes);
  end if;
  if action = 'save_draft' then
    return public.save_draft(target_org,request_id,expected_revision,content);
  end if;
  return public.publish_request(target_org,request_id,expected_revision,content,acknowledged,action = 'submit');
end;
$$;
revoke all on function public.save_ticket(uuid,uuid,integer,integer,jsonb,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.save_ticket(uuid,uuid,integer,integer,jsonb,jsonb,text,boolean) to authenticated;
