-- PanePilot production schema: multi-tenant orgs, real parcel columns, per-org RLS.
-- Run in Supabase SQL Editor (or `supabase db push` once the CLI is linked).

-- ============================================================ orgs & membership

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'trial' check (plan in ('trial', 'solo', 'crew', 'franchise')),
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index org_members_user_idx on public.org_members (user_id);

create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  token uuid not null unique default gen_random_uuid(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz
);

create index org_invites_org_idx on public.org_invites (org_id);

-- Per-org settings: every scoring/pricing coefficient the UI exposes.
create table public.org_settings (
  org_id uuid primary key references public.orgs (id) on delete cascade,
  -- pricing model
  floor_height numeric not null default 11,
  window_to_wall_pct numeric not null default 45,
  window_size numeric not null default 21,
  panes_per_window numeric not null default 1.8,
  rate_per_sqft numeric not null default 0.09,
  lift_fee_per_floor numeric not null default 45,
  min_job numeric not null default 150,
  quarterly_discount_pct numeric not null default 15,
  monthly_discount_pct numeric not null default 28,
  footprint_aspect numeric not null default 1.8,
  -- score algorithm
  min_floors numeric not null default 2,
  max_floors numeric not null default 8,
  weight_value numeric not null default 30,
  weight_fit numeric not null default 20,
  weight_buyer numeric not null default 20,
  weight_portfolio numeric not null default 15,
  weight_density numeric not null default 15,
  -- territory / locality markers (defaults are the Cincinnati design partner;
  -- fully editable, nothing else assumes them)
  local_state text not null default 'OH',
  local_city text not null default 'Cincinnati',
  local_zip_prefix text not null default '45',
  region_state text not null default 'OH',
  -- identity used in outreach + proposals
  company_name text not null default '',
  contact_name text not null default '',
  contact_phone text not null default '',
  contact_email text not null default '',
  home_base text not null default '',
  updated_at timestamptz not null default now()
);

-- ============================================================ parcels & pipeline

create table public.parcels (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  parcel_number text,
  address text not null,
  city text,
  zip text,
  owner_name text,
  owner_key text,          -- normalized owner for portfolio grouping
  owner_mailing text,
  land_use text,
  bldg_sqft numeric,
  stories numeric,
  market_value numeric,
  year_built int,
  lat double precision,
  lon double precision,
  created_at timestamptz not null default now()
);

create index parcels_org_idx on public.parcels (org_id);
create index parcels_org_owner_idx on public.parcels (org_id, owner_key);
create index parcels_org_zip_idx on public.parcels (org_id, zip);

-- Team-shared pipeline state per prospect.
create table public.prospect_state (
  parcel_id bigint primary key references public.parcels (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  status text not null default '' check (status in ('', 'Sequencing', 'Meeting', 'Proposal', 'Won', 'Dead')),
  touch smallint not null default 0 check (touch between 0 and 5),
  last_touch date,
  due date,
  notes text not null default '',
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index prospect_state_org_idx on public.prospect_state (org_id);
create index prospect_state_due_idx on public.prospect_state (org_id, due) where due is not null;

-- Canvassing routes (shared within the org; created_by for provenance).
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null default 'My route',
  stops bigint[] not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index routes_org_idx on public.routes (org_id);

-- ============================================================ RLS

alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.org_invites enable row level security;
alter table public.org_settings enable row level security;
alter table public.parcels enable row level security;
alter table public.prospect_state enable row level security;
alter table public.routes enable row level security;

-- security definer so org_members policies can reference membership without
-- infinite recursion.
create or replace function public.is_org_member(check_org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.org_members
    where org_id = check_org and user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(check_org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.org_members
    where org_id = check_org and user_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

create policy "members read their orgs" on public.orgs
  for select to authenticated using (public.is_org_member(id));
create policy "admins update their orgs" on public.orgs
  for update to authenticated using (public.is_org_admin(id)) with check (public.is_org_admin(id));

create policy "members see membership" on public.org_members
  for select to authenticated using (public.is_org_member(org_id));
create policy "members can leave" on public.org_members
  for delete to authenticated using (user_id = auth.uid() or public.is_org_admin(org_id));

create policy "admins manage invites" on public.org_invites
  for all to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

create policy "members all settings" on public.org_settings
  for all to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

create policy "members all parcels" on public.parcels
  for all to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

create policy "members all prospect_state" on public.prospect_state
  for all to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

create policy "members all routes" on public.routes
  for all to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- ============================================================ RPCs
-- Org creation and invite acceptance mutate multiple tables atomically and
-- must bypass RLS in a controlled way -> security definer functions.

create or replace function public.create_org(org_name text, company text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if org_name is null or length(trim(org_name)) = 0 then
    raise exception 'org name required';
  end if;
  insert into public.orgs (name) values (trim(org_name)) returning id into new_org;
  insert into public.org_members (org_id, user_id, role) values (new_org, auth.uid(), 'owner');
  insert into public.org_settings (org_id, company_name, home_base)
    values (new_org, coalesce(nullif(trim(company), ''), trim(org_name)), '');
  return new_org;
end;
$$;

create or replace function public.accept_invite(invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select * into inv from public.org_invites
    where token = invite_token and accepted_at is null and expires_at > now();
  if not found then
    raise exception 'invite not found or expired';
  end if;
  insert into public.org_members (org_id, user_id, role)
    values (inv.org_id, auth.uid(), inv.role)
    on conflict (org_id, user_id) do nothing;
  update public.org_invites set accepted_at = now() where id = inv.id;
  return inv.org_id;
end;
$$;

-- Look up an invite by token for the accept page (pre-join, so no membership yet).
create or replace function public.invite_preview(invite_token uuid)
returns table (org_name text, email text, expired boolean)
language sql
security definer
set search_path = public
stable
as $$
  select o.name, i.email, (i.accepted_at is not null or i.expires_at <= now())
  from public.org_invites i
  join public.orgs o on o.id = i.org_id
  where i.token = invite_token;
$$;

-- Replace an org's dataset atomically (import flow wipes pipeline state too).
create or replace function public.clear_org_parcels(target_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_admin(target_org) then
    raise exception 'admin required';
  end if;
  delete from public.parcels where org_id = target_org;
end;
$$;
