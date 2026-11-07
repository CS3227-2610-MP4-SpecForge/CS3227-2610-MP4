-- All membership transitions share the organisation row lock. No client writes.
create function private.is_admin(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_verified() and exists(select 1 from public.organisation_members
    where organisation_id = target and user_id = auth.uid() and is_admin);
$$;
revoke all on function private.is_admin(uuid) from public, anon, authenticated;
grant execute on function private.is_admin(uuid) to authenticated;

create table public.organisation_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null,
  status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled')),
  expires_at timestamptz not null default (clock_timestamp() + interval '7 days'),
  created_at timestamptz not null default clock_timestamp()
);
create unique index one_pending_invitation on public.organisation_invitations(organisation_id,recipient_id) where status = 'pending';
create index recipient_invitations on public.organisation_invitations(recipient_id);
alter table public.organisation_invitations enable row level security;
revoke all on public.organisation_invitations from anon, authenticated;
grant select on public.organisation_invitations to authenticated;
create policy invitation_visibility on public.organisation_invitations for select to authenticated
using(private.is_verified() and (recipient_id = auth.uid() or private.is_admin(organisation_id)));

create table private.invitation_admission (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  started_at timestamptz not null, attempts integer not null
);
revoke all on private.invitation_admission from public, anon, authenticated;

create function public.invite_member(target_org uuid, target_email text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare recipient uuid; canonical text;
begin
  perform 1 from public.organisations where id = target_org for update;
  if not private.is_admin(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if target_email is null or char_length(btrim(target_email)) not between 3 and 254 or btrim(target_email) !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'Invalid email' using errcode = '22023';
  end if;
  -- Rejections return normally so the admission counter is committed.
  insert into private.invitation_admission values(target_org, clock_timestamp(), 1)
  on conflict(organisation_id) do update set
    attempts = case when invitation_admission.started_at <= clock_timestamp() - interval '1 hour' then 1 else invitation_admission.attempts + 1 end,
    started_at = case when invitation_admission.started_at <= clock_timestamp() - interval '1 hour' then clock_timestamp() else invitation_admission.started_at end;
  if (select attempts from private.invitation_admission where organisation_id = target_org) > 20 then return false; end if;
  select id, email into recipient, canonical from auth.users where lower(email) = lower(btrim(target_email));
  if recipient is null or exists(select 1 from public.organisation_members where organisation_id = target_org and user_id = recipient) then return true; end if;
  insert into public.organisation_invitations(organisation_id, recipient_id, recipient_email)
  values(target_org, recipient, canonical) on conflict do nothing;
  return true;
end;
$$;

create function public.list_invitations(target_org uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_verified() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if target_org is not null and not private.is_admin(target_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from (
    select i.id, i.organisation_id, o.name as organisation_name, i.recipient_email,
      case when i.status = 'pending' and i.expires_at <= clock_timestamp() then 'expired' else i.status end as status,
      i.expires_at
    from public.organisation_invitations i join public.organisations o on o.id = i.organisation_id
    where (target_org is null and i.recipient_id = auth.uid() or target_org is not null and i.organisation_id = target_org)
      and i.status = 'pending'
    order by i.created_at desc limit 100
  ) i);
end;
$$;

create function public.respond_invitation(invitation_id uuid, decision text) returns void
language plpgsql security definer set search_path = '' as $$
declare invitation public.organisation_invitations; org uuid;
begin
  if not private.is_verified() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select organisation_id into org from public.organisation_invitations where id = invitation_id and recipient_id = auth.uid();
  if org is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform 1 from public.organisations where id = org for update;
  select * into invitation from public.organisation_invitations where id = invitation_id for update;
  if decision is null or decision not in ('accept','decline') then raise exception 'Invalid decision' using errcode = '22023'; end if;
  if invitation.status <> 'pending' or invitation.expires_at <= clock_timestamp() then raise exception 'Invitation no longer pending'; end if;
  if decision = 'accept' then
    insert into public.organisation_members(organisation_id,user_id) values(org, auth.uid()) on conflict do nothing;
  end if;
  update public.organisation_invitations set status = case when decision = 'accept' then 'accepted' else 'declined' end where id = invitation_id;
end;
$$;
revoke all on function public.invite_member(uuid,text), public.list_invitations(uuid), public.respond_invitation(uuid,text) from public, anon, authenticated;
grant execute on function public.invite_member(uuid,text), public.list_invitations(uuid), public.respond_invitation(uuid,text) to authenticated;
