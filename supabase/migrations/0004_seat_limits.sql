-- Seat enforcement by plan. Seat limits (members + pending invites) are checked
-- server-side so the client can't bypass them. Numbers mirror src/lib/plans.ts.

create or replace function public.org_seat_limit(target_org uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select case (select plan from public.orgs where id = target_org)
    when 'solo' then 1
    when 'crew' then 5
    when 'franchise' then 999999
    else 2  -- trial
  end;
$$;

-- Current seats used: accepted members + still-open invites.
create or replace function public.org_seats_used(target_org uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select
    (select count(*) from public.org_members where org_id = target_org)
    + (select count(*) from public.org_invites
        where org_id = target_org and accepted_at is null and expires_at > now());
$$;

-- Create an invite with seat enforcement (replaces the client's direct insert).
create or replace function public.create_invite(
  target_org uuid,
  invite_email text,
  invite_role text default 'member'
)
returns public.org_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  new_row public.org_invites;
begin
  if not public.is_org_admin(target_org) then
    raise exception 'admin required';
  end if;
  if invite_email is null or length(trim(invite_email)) = 0 then
    raise exception 'email required';
  end if;
  if public.org_seats_used(target_org) >= public.org_seat_limit(target_org) then
    raise exception 'Seat limit reached for the % plan. Upgrade to invite more teammates.',
      (select plan from public.orgs where id = target_org);
  end if;
  insert into public.org_invites (org_id, email, role, created_by)
    values (target_org, trim(invite_email), coalesce(nullif(invite_role, ''), 'member'), auth.uid())
    returning * into new_row;
  return new_row;
end;
$$;

-- Enforce again at acceptance time (seats may have changed since the invite was
-- sent, e.g. a plan downgrade). A user already in the org is always allowed.
create or replace function public.accept_invite(invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  already_member boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select * into inv from public.org_invites
    where token = invite_token and accepted_at is null and expires_at > now();
  if not found then
    raise exception 'invite not found or expired';
  end if;

  select exists (
    select 1 from public.org_members where org_id = inv.org_id and user_id = auth.uid()
  ) into already_member;

  if not already_member
     and (select count(*) from public.org_members where org_id = inv.org_id) >= public.org_seat_limit(inv.org_id) then
    raise exception 'This workspace is at its seat limit. Ask an admin to upgrade the plan.';
  end if;

  insert into public.org_members (org_id, user_id, role)
    values (inv.org_id, auth.uid(), inv.role)
    on conflict (org_id, user_id) do nothing;
  update public.org_invites set accepted_at = now() where id = inv.id;
  return inv.org_id;
end;
$$;
