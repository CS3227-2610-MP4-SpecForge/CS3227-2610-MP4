-- Invitations belong to verified email addresses, including addresses not registered yet.
alter table public.organisation_invitations alter column recipient_id drop not null;
alter table public.organisation_invitations drop constraint organisation_invitations_recipient_id_fkey;
alter table public.organisation_invitations add constraint organisation_invitations_recipient_id_fkey
  foreign key (recipient_id) references public.profiles(id) on delete set null;
update public.organisation_invitations set recipient_email = lower(btrim(recipient_email));
update public.organisation_invitations set recipient_id = null where status <> 'accepted';
-- Preserve accepted history; retain the newest pending intent per canonical address.
with duplicates as (
  select id, row_number() over (partition by organisation_id, recipient_email order by created_at desc, id) as position
  from public.organisation_invitations where status = 'pending'
) update public.organisation_invitations set status = 'cancelled'
where id in (select id from duplicates where position > 1);
drop index public.one_pending_invitation;
create unique index one_pending_email_invitation on public.organisation_invitations(organisation_id, recipient_email) where status = 'pending';
create index invitation_email on public.organisation_invitations(recipient_email);
alter table public.organisation_invitations add constraint invitation_canonical_email check(recipient_email = lower(btrim(recipient_email)));

create function private.owns_invitation_email(address text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null and lower(btrim(email)) = address);
$$;
revoke all on function private.owns_invitation_email(text) from public, anon, authenticated;
grant execute on function private.owns_invitation_email(text) to authenticated;
drop policy invitation_visibility on public.organisation_invitations;
create policy invitation_visibility on public.organisation_invitations for select to authenticated
using(private.is_verified() and ((status = 'pending' and private.owns_invitation_email(recipient_email)) or private.is_admin(organisation_id)));

drop function public.invite_member(uuid,text);
create function public.invite_member(target_org uuid, target_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare address text := lower(btrim(target_email));
begin
  perform 1 from public.organisations where id = target_org for update;
  if not private.is_admin(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if address is null or char_length(address) not between 3 and 254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'Invalid email' using errcode = '22023';
  end if;
  insert into private.invitation_admission values(target_org, clock_timestamp(), 1)
  on conflict(organisation_id) do update set
    attempts = case when invitation_admission.started_at <= clock_timestamp() - interval '1 hour' then 1 else least(invitation_admission.attempts + 1, 21) end,
    started_at = case when invitation_admission.started_at <= clock_timestamp() - interval '1 hour' then clock_timestamp() else invitation_admission.started_at end;
  if (select attempts from private.invitation_admission where organisation_id = target_org) > 20 then return jsonb_build_object('status','limited'); end if;
  if exists(select 1 from public.organisation_members m join auth.users u on u.id = m.user_id where m.organisation_id = target_org and lower(btrim(u.email)) = address) then
    return jsonb_build_object('status','member');
  end if;
  if exists(select 1 from public.organisation_invitations where organisation_id = target_org and recipient_email = address and status = 'pending') then
    return jsonb_build_object('status','pending');
  end if;
  insert into public.organisation_invitations(organisation_id,recipient_email) values(target_org,address);
  return jsonb_build_object('status','created');
end;
$$;

create or replace function public.list_invitations(target_org uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_verified() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if target_org is not null and not private.is_admin(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc, i.id), '[]'::jsonb) from (
    select i.id, i.organisation_id, o.name as organisation_name, i.recipient_email,
      case when i.status = 'pending' and i.expires_at <= clock_timestamp() then 'expired' else i.status end as status,
      i.expires_at, i.created_at
    from public.organisation_invitations i join public.organisations o on o.id = i.organisation_id
    where (target_org is null and private.owns_invitation_email(i.recipient_email) and i.status = 'pending'
      or target_org is not null and i.organisation_id = target_org and i.status in ('pending','declined'))
    order by i.created_at desc, i.id limit 100
  ) i);
end;
$$;

create or replace function public.respond_invitation(invitation_id uuid, decision text) returns void
language plpgsql security definer set search_path = '' as $$
declare invitation public.organisation_invitations; org uuid; address text;
begin
  if not private.is_verified() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select organisation_id into org from public.organisation_invitations where id = invitation_id and private.owns_invitation_email(recipient_email);
  if org is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform 1 from public.organisations where id = org for update;
  select * into invitation from public.organisation_invitations where id = invitation_id for update;
  -- Pin current Auth identity while completing the transition (never JWT metadata).
  select lower(btrim(email)) into address from auth.users where id = auth.uid() and email_confirmed_at is not null for share;
  if address is null or address is distinct from invitation.recipient_email then raise exception 'Not allowed' using errcode = '42501'; end if;
  if decision is null or decision not in ('accept','decline') then raise exception 'Invalid decision' using errcode = '22023'; end if;
  if invitation.status <> 'pending' or invitation.expires_at <= clock_timestamp() then raise exception 'Invitation no longer pending'; end if;
  if decision = 'accept' then
    insert into public.organisation_members(organisation_id,user_id) values(org,auth.uid()) on conflict do nothing;
  end if;
  update public.organisation_invitations set status = case when decision = 'accept' then 'accepted' else 'declined' end,
    recipient_id = case when decision = 'accept' then auth.uid() else null end where id = invitation_id;
end;
$$;

drop function public.manage_invitation(uuid,uuid,text);
create function public.manage_invitation(target_org uuid, invitation_id uuid, decision text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare invitation public.organisation_invitations;
begin
  perform 1 from public.organisations where id = target_org for update;
  if not private.is_admin(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if decision is null or decision not in ('cancel','resend') then raise exception 'Invalid decision' using errcode = '22023'; end if;
  select * into invitation from public.organisation_invitations where id = invitation_id and organisation_id = target_org for update;
  if not found then raise exception 'Not allowed' using errcode = '42501'; end if;
  if invitation.status not in ('pending','declined') then raise exception 'Invitation no longer pending'; end if;
  if decision = 'cancel' then
    update public.organisation_invitations set status = 'cancelled' where id = invitation_id;
    return jsonb_build_object('status','cancelled');
  end if;
  if invitation.status <> 'pending' or invitation.expires_at > clock_timestamp() then raise exception 'Only expired invitations can be resent'; end if;
  insert into private.invitation_admission values(target_org, clock_timestamp(), 1)
  on conflict(organisation_id) do update set
    attempts = case when invitation_admission.started_at <= clock_timestamp() - interval '1 hour' then 1 else least(invitation_admission.attempts + 1, 21) end,
    started_at = case when invitation_admission.started_at <= clock_timestamp() - interval '1 hour' then clock_timestamp() else invitation_admission.started_at end;
  if (select attempts from private.invitation_admission where organisation_id = target_org) > 20 then return jsonb_build_object('status','limited'); end if;
  if exists(select 1 from public.organisation_members m join auth.users u on u.id = m.user_id where m.organisation_id = target_org and lower(btrim(u.email)) = invitation.recipient_email) then
    return jsonb_build_object('status','member');
  end if;
  update public.organisation_invitations set expires_at = clock_timestamp() + interval '7 days' where id = invitation_id;
  return jsonb_build_object('status','resent');
end;
$$;
revoke all on function public.invite_member(uuid,text), public.list_invitations(uuid), public.respond_invitation(uuid,text), public.manage_invitation(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.invite_member(uuid,text), public.list_invitations(uuid), public.respond_invitation(uuid,text), public.manage_invitation(uuid,uuid,text) to authenticated;
