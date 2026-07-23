-- RLS cross-org isolation check.
--
-- Proves that a member of one org cannot read or write another org's data.
-- Runs as a superuser (it uses `set local role` + a simulated JWT to act as
-- each user), so run it via the Supabase SQL Editor, `psql`, or the Management
-- API database/query endpoint — not through the anon/PostgREST path. It can't
-- run in CI because CI has no database; it's a manual smoke test after any
-- change to the RLS policies in migration 0001.
--
-- Expected: every SELECT count below is 0 for the "other" org, and the write
-- attempt is blocked. The script cleans up its own test rows at the end.

-- ---- setup: two orgs, two users, one parcel each --------------------------
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000000a1','rls-a@test.invalid','authenticated','authenticated',now(),now()),
  ('00000000-0000-0000-0000-0000000000b1','rls-b@test.invalid','authenticated','authenticated',now(),now());
insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-00000000aaaa','RLS Org A'),
  ('00000000-0000-0000-0000-00000000bbbb','RLS Org B');
insert into public.org_members (org_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000aaaa','00000000-0000-0000-0000-0000000000a1','owner'),
  ('00000000-0000-0000-0000-00000000bbbb','00000000-0000-0000-0000-0000000000b1','owner');
insert into public.org_settings (org_id) values
  ('00000000-0000-0000-0000-00000000aaaa'),
  ('00000000-0000-0000-0000-00000000bbbb');
insert into public.parcels (org_id, address) values
  ('00000000-0000-0000-0000-00000000aaaa','A-secret-parcel'),
  ('00000000-0000-0000-0000-00000000bbbb','B-secret-parcel');

-- ---- assert: user B sees only org B ---------------------------------------
begin;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  -- Expect: 0, 1, 0, 0
  select
    (select count(*) from public.parcels where address='A-secret-parcel')::int as b_sees_A_parcels,
    (select count(*) from public.parcels where address='B-secret-parcel')::int as b_sees_B_parcels,
    (select count(*) from public.org_settings where org_id='00000000-0000-0000-0000-00000000aaaa')::int as b_sees_A_settings,
    (select count(*) from public.orgs where id='00000000-0000-0000-0000-00000000aaaa')::int as b_sees_A_org;
rollback;

-- ---- assert: user A sees only org A ---------------------------------------
begin;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  -- Expect: 0, 1
  select
    (select count(*) from public.parcels where address='B-secret-parcel')::int as a_sees_B_parcels,
    (select count(*) from public.parcels where address='A-secret-parcel')::int as a_sees_A_parcels;
rollback;

-- ---- assert: user B cannot write into org A -------------------------------
begin;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  do $$
  begin
    insert into public.parcels (org_id, address) values ('00000000-0000-0000-0000-00000000aaaa','B-HACK');
    raise exception 'RLS_FAIL: user B wrote into org A';
  exception when insufficient_privilege then
    raise notice 'write correctly blocked by RLS';
  end $$;
rollback;

-- ---- cleanup --------------------------------------------------------------
delete from public.orgs where id in ('00000000-0000-0000-0000-00000000aaaa','00000000-0000-0000-0000-00000000bbbb');
delete from auth.users where id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1');
