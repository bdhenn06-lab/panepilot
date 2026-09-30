-- Local-development seed data.
--
-- Runs only via `supabase db reset` and the initial `supabase start` (Supabase
-- never applies seed.sql to a hosted/production database), so it is safe to keep
-- committed. It creates ready-to-explore demo workspaces so you can log in
-- immediately instead of signing up and importing a CSV first.
--
-- Logins (all use password `panepilot`):
--   demo@panepilot.test         owner  — "Cincinnati Shine Co"     (commercial)
--   teammate@panepilot.test     admin  — same org, to demo the shared team
--                                        pipeline + realtime sync (open both in
--                                        two browsers and watch changes stream)
--   residential@panepilot.test  owner  — "Queen City Home Shine"   (residential)
--
-- The app puts a user in their oldest org (no switcher), so each mode gets its
-- own owner. Everything keys off fixed UUIDs and is guarded so re-seeding is a
-- no-op.

do $$
declare
  demo_user        uuid := '00000000-0000-0000-0000-0000000de701';
  teammate_user    uuid := '00000000-0000-0000-0000-0000000de702';
  residential_user uuid := '00000000-0000-0000-0000-0000000de703';
  comm_org         uuid := '00000000-0000-0000-0000-00000000019a';
  res_org          uuid := '00000000-0000-0000-0000-00000000019b';
  u                record;
begin
  -- 1. Confirmed auth users (email + password) -------------------------------
  -- GoTrue scans the token columns as non-null Go strings, so they must be ''
  -- (not NULL) or password login fails with "Database error querying schema".
  for u in
    select * from (values
      (demo_user,        'demo@panepilot.test'),
      (teammate_user,    'teammate@panepilot.test'),
      (residential_user, 'residential@panepilot.test')
    ) as t(uid, email)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.uid, 'authenticated',
      'authenticated', u.email,
      extensions.crypt('panepilot', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}', '{}',
      '', '', '', '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      u.uid, u.uid, u.uid::text,
      jsonb_build_object('sub', u.uid::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now()
    ) on conflict (provider_id, provider) do nothing;
  end loop;

  -- ===================================================================
  -- 2. Commercial org: "Cincinnati Shine Co" (demo + teammate)
  -- ===================================================================
  insert into public.orgs (id, name, plan)
    values (comm_org, 'Cincinnati Shine Co', 'trial')
    on conflict (id) do nothing;

  insert into public.org_members (org_id, user_id, role) values
    (comm_org, demo_user, 'owner'),
    (comm_org, teammate_user, 'admin')
    on conflict do nothing;

  insert into public.org_settings (
      org_id, company_name, contact_name, contact_email, contact_phone,
      local_state, local_city, local_zip_prefix, region_state, service_mode)
    values (
      comm_org, 'Cincinnati Shine Co', 'Demo Owner', 'demo@panepilot.test',
      '(513) 555-0142', 'OH', 'Cincinnati', '45', 'OH', 'commercial')
    on conflict (org_id) do nothing;

  if not exists (select 1 from public.parcels where org_id = comm_org) then
    insert into public.parcels (
      org_id, parcel_number, address, city, zip, owner_name, owner_key,
      land_use, bldg_sqft, stories, market_value, year_built, lat, lon)
    values
      (comm_org, '101-0002-0020', '600 Walnut St',    'Cincinnati', '45202', 'Fifth Third Center Owner LP', 'fifth third center owner', 'Office Bank',           410000, 6, 22750000, 1969, 39.1008, -84.5138),
      (comm_org, '101-0001-0010', '441 Vine St',      'Cincinnati', '45202', 'Carew Realty LLC',            'carew realty',             'Office',                320000, 5, 18500000, 1930, 39.1015, -84.5125),
      (comm_org, '101-0003-0030', '151 W 5th St',     'Cincinnati', '45202', 'Queen City Hotels Inc',       'queen city hotels',        'Hotel',                 180000, 4,  9800000, 1985, 39.1002, -84.5155),
      (comm_org, '101-0009-0090', '700 Race St',      'Cincinnati', '45202', 'Central Office Tower LP',     'central office tower',     'Office',                275000, 5, 14200000, 1988, 39.1049, -84.5169),
      (comm_org, '101-0004-0040', '35 E 7th St',      'Cincinnati', '45202', 'Downtown Retail Partners',    'downtown retail partners', 'Retail Store',           64000, 2,  3400000, 1978, 39.1025, -84.5121),
      (comm_org, '101-0008-0080', '1201 Elm St',      'Cincinnati', '45202', 'Music Hall Retail LLC',       'music hall retail',        'Retail Shop',            52000, 2,  2650000, 1966, 39.1094, -84.5188),
      (comm_org, '101-0005-0050', '2200 Reading Rd',  'Cincinnati', '45206', 'Mercy Medical Group',         'mercy medical group',      'Medical Clinic',         95000, 3,  6200000, 1992, 39.1288, -84.4922),
      (comm_org, '101-0006-0060', '4750 Madison Rd',  'Cincinnati', '45227', 'Oakley Office Plaza LLC',     'oakley office plaza',      'Office',                140000, 3,  7100000, 2001, 39.1571, -84.4288),
      (comm_org, '101-0010-0100', '3900 Rosslyn Dr',  'Cincinnati', '45209', 'Green Twp Restaurants Inc',   'green twp restaurants',    'Restaurant',             18000, 1,  1450000, 2005, 39.1533, -84.4211),
      (comm_org, '101-0007-0070', '8100 Industrial Dr','Cincinnati', '45217', 'Tri-State Warehousing',      'tri-state warehousing',    'Warehouse Industrial',  220000, 1,  4800000, 1974, 39.1889, -84.4655);

    -- A few prospects already in motion, so the pipeline/funnel is non-empty.
    insert into public.prospect_state (parcel_id, org_id, status, touch, last_touch, due, notes, updated_by)
    select p.id, comm_org, v.status, v.touch, v.last_touch, v.due, v.notes, v.updated_by
    from (values
      ('101-0002-0020', 'Meeting'::text,    2, (now() - interval '3 days')::date, (now() + interval '2 days')::date, 'Facilities manager wants a walkthrough of the atrium glass.', teammate_user),
      ('101-0001-0010', 'Sequencing'::text, 1, (now() - interval '1 day')::date,  (now() + interval '4 days')::date, 'Left voicemail with property management.', demo_user),
      ('101-0003-0030', 'Proposal'::text,   3, (now() - interval '6 days')::date, (now() + interval '1 day')::date,  'Sent quarterly proposal; awaiting GM sign-off.', teammate_user),
      ('101-0009-0090', 'Won'::text,        5, (now() - interval '10 days')::date, null,                             'Signed quarterly contract. Kickoff scheduled.', demo_user)
    ) as v(parcel_number, status, touch, last_touch, due, notes, updated_by)
    join public.parcels p on p.org_id = comm_org and p.parcel_number = v.parcel_number;

    -- One closed job feeds the estimator's calibration loop.
    insert into public.job_outcomes (
        org_id, parcel_id, land_use, service_mode,
        estimated_price, actual_price, estimated_hours, actual_hours, created_by)
    select comm_org, p.id, p.land_use, 'commercial', 2700, 3100, 9, 10.5, demo_user
    from public.parcels p
    where p.org_id = comm_org and p.parcel_number = '101-0002-0020';

    -- A shared canvassing route (downtown high-rises clustered together).
    insert into public.routes (org_id, name, stops, created_by)
    select comm_org, 'Downtown CBD loop',
      array(select p.id from public.parcels p
            where p.org_id = comm_org
              and p.parcel_number in ('101-0002-0020','101-0001-0010','101-0009-0090','101-0003-0030')
            order by p.parcel_number),
      demo_user;
  end if;

  -- ===================================================================
  -- 3. Residential org: "Queen City Home Shine" (residential mode)
  -- ===================================================================
  insert into public.orgs (id, name, plan)
    values (res_org, 'Queen City Home Shine', 'trial')
    on conflict (id) do nothing;

  insert into public.org_members (org_id, user_id, role)
    values (res_org, residential_user, 'owner')
    on conflict do nothing;

  insert into public.org_settings (
      org_id, company_name, contact_name, contact_email, contact_phone,
      local_state, local_city, local_zip_prefix, region_state, service_mode,
      res_sqft_per_window, res_price_per_window, res_upper_story_pct)
    values (
      res_org, 'Queen City Home Shine', 'Demo Owner', 'residential@panepilot.test',
      '(513) 555-0177', 'OH', 'Cincinnati', '45', 'OH', 'residential',
      130, 9, 25)
    on conflict (org_id) do nothing;

  if not exists (select 1 from public.parcels where org_id = res_org) then
    insert into public.parcels (
      org_id, parcel_number, address, city, zip, owner_name, owner_key,
      land_use, bldg_sqft, stories, market_value, year_built, lat, lon)
    values
      (res_org, '201-0001-0010', '2718 Erie Ave',       'Cincinnati', '45208', 'Katherine Bishop',  'katherine bishop',  'Single Family Residential', 4200, 2, 1250000, 1926, 39.1379, -84.4318),
      (res_org, '201-0002-0020', '1310 Grace Ave',      'Cincinnati', '45208', 'Daniel Whitmore',   'daniel whitmore',   'Single Family Residential', 3600, 2,  865000, 1931, 39.1421, -84.4267),
      (res_org, '201-0003-0030', '3455 Zumstein Ave',   'Cincinnati', '45208', 'Priya Nair',        'priya nair',        'Single Family Residential', 3100, 2,  720000, 1940, 39.1356, -84.4189),
      (res_org, '201-0004-0040', '6120 Grand Vista Ave','Cincinnati', '45213', 'Marcus Lee',        'marcus lee',        'Single Family Residential', 2800, 2,  540000, 1955, 39.1712, -84.4098),
      (res_org, '201-0005-0050', '980 Delta Ave',       'Cincinnati', '45226', 'Sofia Alvarez',     'sofia alvarez',     'Single Family Residential', 2600, 2,  610000, 1948, 39.1188, -84.4241),
      (res_org, '201-0006-0060', '4707 Eastern Ave',    'Cincinnati', '45226', 'Thomas Reed',       'thomas reed',       'Single Family Residential', 2200, 2,  430000, 1962, 39.1122, -84.4360),
      (res_org, '201-0007-0070', '1522 Herschel Ave',   'Cincinnati', '45208', 'Angela Foster',     'angela foster',     'Single Family Residential', 1900, 1,  385000, 1951, 39.1408, -84.4302),
      (res_org, '201-0008-0080', '3890 Isabella Ave',   'Cincinnati', '45209', 'Brian Kowalski',    'brian kowalski',    'Single Family Residential', 1650, 1,  312000, 1958, 39.1496, -84.4235);

    insert into public.prospect_state (parcel_id, org_id, status, touch, last_touch, due, notes, updated_by)
    select p.id, res_org, v.status, v.touch, v.last_touch, v.due, v.notes, residential_user
    from (values
      ('201-0001-0010', 'Sequencing'::text, 1, (now() - interval '2 days')::date, (now() + interval '3 days')::date, 'Homeowner asked about a spring exterior + storm-window clean.'),
      ('201-0002-0020', 'Meeting'::text,    2, (now() - interval '4 days')::date, (now() + interval '1 day')::date,  'Walk-through booked for Saturday morning.')
    ) as v(parcel_number, status, touch, last_touch, due, notes)
    join public.parcels p on p.org_id = res_org and p.parcel_number = v.parcel_number;

    insert into public.routes (org_id, name, stops, created_by)
    select res_org, 'Hyde Park / Mt Lookout',
      array(select p.id from public.parcels p
            where p.org_id = res_org
              and p.parcel_number in ('201-0001-0010','201-0002-0020','201-0003-0030','201-0005-0050')
            order by p.parcel_number),
      residential_user;
  end if;
end $$;
