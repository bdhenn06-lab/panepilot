-- Tenant boundaries and atomic, resumable territory imports.
begin;

revoke update on public.orgs from authenticated, anon;
grant update (name) on public.orgs to authenticated;
drop policy "members all parcels" on public.parcels;
create policy "members read parcels" on public.parcels for select to authenticated
  using (public.is_org_member(org_id));
create policy "members geocode parcels" on public.parcels for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "admins delete parcels" on public.parcels for delete to authenticated
  using (public.is_org_admin(org_id));
revoke insert, update on public.parcels from authenticated, anon;
grant update (lat, lon) on public.parcels to authenticated;

alter table public.parcels add constraint parcels_org_id_id_key unique (org_id, id);
alter table public.prospect_state drop constraint prospect_state_parcel_id_fkey;
alter table public.prospect_state add constraint prospect_state_parcel_tenant_fkey
  foreign key (org_id, parcel_id) references public.parcels(org_id, id) on delete cascade;
alter table public.job_outcomes drop constraint job_outcomes_parcel_id_fkey;
alter table public.job_outcomes add constraint job_outcomes_parcel_tenant_fkey
  foreign key (org_id, parcel_id) references public.parcels(org_id, id) on delete set null (parcel_id);

-- No client may sidestep invite seat checks by inserting directly.
drop policy "admins manage invites" on public.org_invites;
create policy "admins read invites" on public.org_invites for select to authenticated
  using (public.is_org_admin(org_id));
create policy "admins revoke invites" on public.org_invites for delete to authenticated
  using (public.is_org_admin(org_id));
revoke insert, update on public.org_invites from authenticated, anon;

create table public.parcel_imports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expected_rows integer not null check (expected_rows between 1 and 200000),
  created_at timestamptz not null default now(),
  committed_at timestamptz
);
create table public.parcel_import_chunks (
  import_id uuid not null references public.parcel_imports(id) on delete cascade,
  chunk_offset integer not null check (chunk_offset >= 0),
  rows jsonb not null check (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) between 1 and 500),
  primary key (import_id, chunk_offset)
);
alter table public.parcel_imports enable row level security;
alter table public.parcel_import_chunks enable row level security;
revoke all on public.parcel_imports, public.parcel_import_chunks from anon, authenticated;

create function public.begin_parcel_import(target_org uuid, row_count integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.is_org_admin(target_org) then raise exception 'admin required'; end if;
  delete from public.parcel_imports where org_id = target_org and created_at < now() - interval '1 day';
  insert into public.parcel_imports(org_id, created_by, expected_rows)
    values (target_org, auth.uid(), row_count) returning id into new_id;
  return new_id;
end $$;

create function public.append_parcel_import(import_id uuid, chunk_offset integer, rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare imp public.parcel_imports;
begin
  select * into imp from public.parcel_imports where id = import_id for update;
  if not found or imp.created_by <> auth.uid() or not public.is_org_admin(imp.org_id)
    or imp.created_at < now() - interval '1 day' or imp.committed_at is not null then
    raise exception 'import unavailable';
  end if;
  if chunk_offset % 500 <> 0 or jsonb_typeof(rows) <> 'array'
    or jsonb_array_length(rows) <> least(500, imp.expected_rows - chunk_offset) then
    raise exception 'invalid import chunk';
  end if;
  insert into public.parcel_import_chunks values (import_id, chunk_offset, rows)
    on conflict on constraint parcel_import_chunks_pkey do update set rows = excluded.rows;
end $$;

create function public.commit_parcel_import(import_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare imp public.parcel_imports; actual_count integer;
begin
  select * into imp from public.parcel_imports where id = import_id for update;
  if not found or imp.created_by <> auth.uid() or not public.is_org_admin(imp.org_id) then
    raise exception 'import unavailable';
  end if;
  if imp.committed_at is not null then return imp.expected_rows; end if;
  if imp.created_at < now() - interval '1 day' then raise exception 'import expired'; end if;
  perform pg_advisory_xact_lock(hashtextextended(imp.org_id::text, 0));
  select sum(jsonb_array_length(c.rows)) into actual_count
    from public.parcel_import_chunks c where c.import_id = imp.id;
  if actual_count is distinct from imp.expected_rows then raise exception 'import incomplete'; end if;

  create temporary table incoming_parcels on commit drop as
    select p.* from public.parcel_import_chunks c,
      lateral jsonb_populate_recordset(null::public.parcels, c.rows) p
    where c.import_id = imp.id;
  update incoming_parcels set id = null, org_id = imp.org_id,
    parcel_number = nullif(trim(parcel_number), ''), address = trim(address);
  if exists (select 1 from incoming_parcels where address is null or address = '') then
    raise exception 'every parcel needs an address';
  end if;
  if exists (select parcel_number from incoming_parcels where parcel_number is not null
    group by parcel_number having count(*) > 1) then raise exception 'duplicate parcel IDs in import'; end if;
  if exists (select trim(parcel_number) from public.parcels where org_id = imp.org_id
    and nullif(trim(parcel_number), '') is not null group by trim(parcel_number) having count(*) > 1) then
    raise exception 'existing dataset contains duplicate parcel IDs; resolve them before replacement';
  end if;
  -- Retain IDs for matching parcels. Live notes, states, and outcomes stay attached.
  update incoming_parcels i set id = p.id from public.parcels p
    where p.org_id = imp.org_id and trim(p.parcel_number) = i.parcel_number;
  update public.parcels p set parcel_number=i.parcel_number, address=i.address, city=i.city,
    zip=i.zip, owner_name=i.owner_name, owner_key=i.owner_key, owner_mailing=i.owner_mailing,
    land_use=i.land_use, bldg_sqft=i.bldg_sqft, stories=i.stories, market_value=i.market_value,
    year_built=i.year_built, lat=i.lat, lon=i.lon from incoming_parcels i where p.id=i.id;
  delete from public.parcels p where p.org_id=imp.org_id
    and not exists(select 1 from incoming_parcels i where i.id=p.id);
  insert into public.parcels(org_id, parcel_number, address, city, zip, owner_name, owner_key,
    owner_mailing, land_use, bldg_sqft, stories, market_value, year_built, lat, lon)
    select org_id, parcel_number, address, city, zip, owner_name, owner_key, owner_mailing,
      land_use, bldg_sqft, stories, market_value, year_built, lat, lon from incoming_parcels where id is null;
  update public.routes r set stops = array(select s from unnest(r.stops) s
    where exists(select 1 from public.parcels p where p.org_id=imp.org_id and p.id=s)), updated_at=now()
    where r.org_id=imp.org_id;
  update public.parcel_imports set committed_at=now() where id=imp.id;
  delete from public.parcel_import_chunks c where c.import_id=imp.id;
  return actual_count;
end $$;

-- Serialize seat allocation at the database boundary, including concurrent invites.
create or replace function public.create_invite(target_org uuid, invite_email text, invite_role text default 'member')
returns public.org_invites language plpgsql security definer set search_path=public as $$
declare new_row public.org_invites;
begin
  if not public.is_org_admin(target_org) then raise exception 'admin required'; end if;
  perform 1 from public.orgs where id=target_org for update;
  if invite_email is null or trim(invite_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then raise exception 'valid email required'; end if;
  if public.org_seats_used(target_org) >= public.org_seat_limit(target_org) then raise exception 'seat limit reached'; end if;
  insert into public.org_invites(org_id,email,role,created_by)
    values(target_org,lower(trim(invite_email)),invite_role,auth.uid()) returning * into new_row;
  return new_row;
end $$;
create or replace function public.accept_invite(invite_token uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare inv public.org_invites;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into inv from public.org_invites where token=invite_token;
  if not found then raise exception 'invite unavailable'; end if;
  perform 1 from public.orgs where id=inv.org_id for update;
  select * into inv from public.org_invites where token=invite_token for update;
  if inv.accepted_at is not null or inv.expires_at<=now() then raise exception 'invite expired or used'; end if;
  if lower(inv.email) <> lower((select email from auth.users where id=auth.uid())) then
    raise exception 'sign in with the email address this invitation was sent to'; end if;
  if not public.is_org_member(inv.org_id) then
    if (select count(*) from public.org_members where org_id=inv.org_id) >= public.org_seat_limit(inv.org_id)
      then raise exception 'seat limit reached'; end if;
    insert into public.org_members(org_id,user_id,role) values(inv.org_id,auth.uid(),inv.role);
  end if;
  update public.org_invites set accepted_at=now() where id=inv.id;
  return inv.org_id;
end $$;

-- Existing outcomes used calibrated estimates and cannot safely train the base model.
alter table public.job_outcomes add column baseline_version integer;

revoke all on function public.begin_parcel_import(uuid,integer),
  public.append_parcel_import(uuid,integer,jsonb), public.commit_parcel_import(uuid) from public, anon;
grant execute on function public.begin_parcel_import(uuid,integer),
  public.append_parcel_import(uuid,integer,jsonb), public.commit_parcel_import(uuid) to authenticated;
commit;
