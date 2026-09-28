-- Local-development seed data.
--
-- Runs only via `supabase db reset` and the initial `supabase start` (Supabase
-- never applies seed.sql to a hosted/production database), so it is safe to keep
-- committed. It creates a ready-to-explore demo workspace so you can log in
-- immediately instead of signing up and importing a CSV first.
--
--   Login:  demo@panepilot.test  /  panepilot
--
-- Everything keys off fixed UUIDs and is guarded so re-seeding is a no-op.

do $$
declare
  demo_user uuid := '00000000-0000-0000-0000-0000000de701';
  demo_org  uuid := '00000000-0000-0000-0000-00000000019a';
begin
  -- 1. Confirmed auth user (email + password) --------------------------------
  -- GoTrue scans the token columns as non-null Go strings, so they must be ''
  -- (not NULL) or password login fails with "Database error querying schema".
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', demo_user, 'authenticated',
    'authenticated', 'demo@panepilot.test',
    extensions.crypt('panepilot', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}',
    '', '', '', '', '', '', ''
  ) on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    demo_user, demo_user, demo_user::text,
    jsonb_build_object('sub', demo_user::text, 'email', 'demo@panepilot.test',
                       'email_verified', true),
    'email', now(), now(), now()
  ) on conflict (provider_id, provider) do nothing;

  -- 2. Org, owner membership, and Cincinnati settings ------------------------
  insert into public.orgs (id, name, plan)
    values (demo_org, 'Cincinnati Shine Co', 'trial')
    on conflict (id) do nothing;

  insert into public.org_members (org_id, user_id, role)
    values (demo_org, demo_user, 'owner')
    on conflict do nothing;

  insert into public.org_settings (
      org_id, company_name, contact_name, contact_email, contact_phone,
      local_state, local_city, local_zip_prefix, region_state, service_mode)
    values (
      demo_org, 'Cincinnati Shine Co', 'Demo Owner', 'demo@panepilot.test',
      '(513) 555-0142', 'OH', 'Cincinnati', '45', 'OH', 'commercial')
    on conflict (org_id) do nothing;

  -- 3. Sample commercial parcels + a partially-worked pipeline ---------------
  -- Guarded so re-running the seed on an already-populated org does nothing.
  if not exists (select 1 from public.parcels where org_id = demo_org) then
    insert into public.parcels (
      org_id, parcel_number, address, city, zip, owner_name, owner_key,
      land_use, bldg_sqft, stories, market_value, year_built, lat, lon)
    values
      (demo_org, '101-0002-0020', '600 Walnut St',    'Cincinnati', '45202', 'Fifth Third Center Owner LP', 'fifth third center owner', 'Office Bank',           410000, 6, 22750000, 1969, 39.1008, -84.5138),
      (demo_org, '101-0001-0010', '441 Vine St',      'Cincinnati', '45202', 'Carew Realty LLC',            'carew realty',             'Office',                320000, 5, 18500000, 1930, 39.1015, -84.5125),
      (demo_org, '101-0003-0030', '151 W 5th St',     'Cincinnati', '45202', 'Queen City Hotels Inc',       'queen city hotels',        'Hotel',                 180000, 4,  9800000, 1985, 39.1002, -84.5155),
      (demo_org, '101-0009-0090', '700 Race St',      'Cincinnati', '45202', 'Central Office Tower LP',     'central office tower',     'Office',                275000, 5, 14200000, 1988, 39.1049, -84.5169),
      (demo_org, '101-0004-0040', '35 E 7th St',      'Cincinnati', '45202', 'Downtown Retail Partners',    'downtown retail partners', 'Retail Store',           64000, 2,  3400000, 1978, 39.1025, -84.5121),
      (demo_org, '101-0008-0080', '1201 Elm St',      'Cincinnati', '45202', 'Music Hall Retail LLC',       'music hall retail',        'Retail Shop',            52000, 2,  2650000, 1966, 39.1094, -84.5188),
      (demo_org, '101-0005-0050', '2200 Reading Rd',  'Cincinnati', '45206', 'Mercy Medical Group',         'mercy medical group',      'Medical Clinic',         95000, 3,  6200000, 1992, 39.1288, -84.4922),
      (demo_org, '101-0006-0060', '4750 Madison Rd',  'Cincinnati', '45227', 'Oakley Office Plaza LLC',     'oakley office plaza',      'Office',                140000, 3,  7100000, 2001, 39.1571, -84.4288),
      (demo_org, '101-0010-0100', '3900 Rosslyn Dr',  'Cincinnati', '45209', 'Green Twp Restaurants Inc',   'green twp restaurants',    'Restaurant',             18000, 1,  1450000, 2005, 39.1533, -84.4211),
      (demo_org, '101-0007-0070', '8100 Industrial Dr','Cincinnati', '45217', 'Tri-State Warehousing',      'tri-state warehousing',    'Warehouse Industrial',  220000, 1,  4800000, 1974, 39.1889, -84.4655);

    -- A few prospects already in motion, so the pipeline/funnel is non-empty.
    insert into public.prospect_state (parcel_id, org_id, status, touch, last_touch, due, notes, updated_by)
    select p.id, demo_org, v.status, v.touch, v.last_touch, v.due, v.notes, demo_user
    from (values
      ('101-0002-0020', 'Meeting'::text,    2, (now() - interval '3 days')::date, (now() + interval '2 days')::date, 'Facilities manager wants a walkthrough of the atrium glass.'),
      ('101-0001-0010', 'Sequencing'::text, 1, (now() - interval '1 day')::date,  (now() + interval '4 days')::date, 'Left voicemail with property management.'),
      ('101-0003-0030', 'Proposal'::text,   3, (now() - interval '6 days')::date, (now() + interval '1 day')::date,  'Sent quarterly proposal; awaiting GM sign-off.'),
      ('101-0009-0090', 'Won'::text,        5, (now() - interval '10 days')::date, null,                             'Signed quarterly contract. Kickoff scheduled.')
    ) as v(parcel_number, status, touch, last_touch, due, notes)
    join public.parcels p on p.org_id = demo_org and p.parcel_number = v.parcel_number;

    -- One closed job feeds the estimator's calibration loop.
    insert into public.job_outcomes (
        org_id, parcel_id, land_use, service_mode,
        estimated_price, actual_price, estimated_hours, actual_hours, created_by)
    select demo_org, p.id, p.land_use, 'commercial', 2700, 3100, 9, 10.5, demo_user
    from public.parcels p
    where p.org_id = demo_org and p.parcel_number = '101-0002-0020';
  end if;
end $$;
