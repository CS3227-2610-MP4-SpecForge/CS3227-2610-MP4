create function public.manage_invitation(target_org uuid, invitation_id uuid, decision text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare invitation public.organisation_invitations;
begin
  perform 1 from public.organisations where id = target_org for update;
  if not private.is_admin(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if decision is null or decision not in ('cancel','resend') then raise exception 'Invalid decision' using errcode = '22023'; end if;
  select * into invitation from public.organisation_invitations where id = invitation_id and organisation_id = target_org for update;
  if not found then raise exception 'Not allowed' using errcode = '42501'; end if;
  if invitation.status <> 'pending' then raise exception 'Invitation no longer pending'; end if;
  if decision = 'cancel' then
    update public.organisation_invitations set status = 'cancelled' where id = invitation_id;
    return true;
  end if;
  if invitation.expires_at > clock_timestamp() then raise exception 'Only expired invitations can be resent'; end if;
  -- Uses exactly the same persistent admission window as new invitations.
  insert into private.invitation_admission values(target_org, clock_timestamp(), 1)
  on conflict(organisation_id) do update set
    attempts = case when invitation_admission.started_at <= clock_timestamp() - interval '1 hour' then 1 else least(invitation_admission.attempts + 1, 21) end,
    started_at = case when invitation_admission.started_at <= clock_timestamp() - interval '1 hour' then clock_timestamp() else invitation_admission.started_at end;
  if (select attempts from private.invitation_admission where organisation_id = target_org) > 20 then return false; end if;
  if exists(select 1 from public.organisation_members where organisation_id = target_org and user_id = invitation.recipient_id) then raise exception 'Already a member'; end if;
  update public.organisation_invitations set expires_at = clock_timestamp() + interval '7 days' where id = invitation_id;
  return true;
end;
$$;
revoke all on function public.manage_invitation(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.manage_invitation(uuid,uuid,text) to authenticated;
