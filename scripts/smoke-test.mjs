#!/usr/bin/env node
/**
 * End-to-end smoke test against a running Supabase stack.
 *
 * Unlike the unit tests (pure scoring engine) this exercises the real backend:
 * auth, row-level security, and the parcels write path the CSV import uses. It
 * relies on the demo workspace created by `supabase/seed.sql`.
 *
 * Usage (with a local stack already up via `supabase start`):
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_ANON_KEY=<anon key from `supabase status`> \
 *   node scripts/smoke-test.mjs
 *
 * Both env vars fall back to the standard local defaults. Exits non-zero on the
 * first failed assertion.
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const DEMO_EMAIL = 'demo@panepilot.test';
const DEMO_PASSWORD = 'panepilot';

let passed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    console.error(`  \u2717 ${name}${detail ? ` — ${detail}` : ''}`);
    throw new Error(`Smoke test failed: ${name}`);
  }
}

async function main() {
  console.log(`Smoke test against ${URL}`);

  // 1. RLS blocks anonymous reads of tenant data ----------------------------
  const anon = createClient(URL, ANON_KEY);
  const anonRead = await anon.from('parcels').select('id').limit(5);
  check(
    'anonymous client cannot read parcels (RLS)',
    !anonRead.error && (anonRead.data?.length ?? 0) === 0,
    `got ${anonRead.data?.length ?? 'error'} rows`,
  );

  // 2. Password auth --------------------------------------------------------
  const user = createClient(URL, ANON_KEY);
  const signIn = await user.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  check('demo user signs in with password', !signIn.error && !!signIn.data.session, signIn.error?.message);

  // 3. Authenticated user reads their seeded org data -----------------------
  // The demo user may belong to more than one workspace; RLS scopes every read
  // to the user's orgs, so select without an org filter and let policy do it.
  const memberships = await user.from('org_members').select('org_id');
  check('authenticated user has an org membership', !memberships.error && (memberships.data?.length ?? 0) >= 1, memberships.error?.message);


  const parcels = await user.from('parcels').select('id');
  check('seeded parcels are visible to the member', !parcels.error && (parcels.data?.length ?? 0) >= 10, `got ${parcels.data?.length ?? 'error'}`);

  const pipeline = await user.from('prospect_state').select('parcel_id');
  check('seeded pipeline state is visible', !pipeline.error && (pipeline.data?.length ?? 0) >= 1, `got ${pipeline.data?.length ?? 'error'}`);

  // Disposable workspace: never replace the seeded team's territory.
  const marker = `SMOKE-${Date.now()}`;
  const org = await user.rpc('create_org', { org_name: marker });
  check('creates isolated smoke workspace', !org.error && !!org.data, org.error?.message);
  const orgId = org.data;
  const started = await user.rpc('begin_parcel_import', {target_org: orgId, row_count: 1});
  check('starts staged import', !started.error && !!started.data, started.error?.message);
  const uploaded = await user.rpc('append_parcel_import', {
    import_id: started.data, chunk_offset: 0,
    rows: [{parcel_number: marker, address:'1 Smoke Test Plaza',city:'Cincinnati',zip:'45202',land_use:'Office',bldg_sqft:50000,stories:3}],
  });
  check('stages parcel', !uploaded.error, uploaded.error?.message);
  const committed = await user.rpc('commit_parcel_import', {import_id: started.data});
  check('commits import atomically', !committed.error && committed.data === 1, committed.error?.message);
  const readBack = await user.from('parcels').select('id,address').eq('org_id',orgId).single();
  check('parcel reads back', !readBack.error && readBack.data.address === '1 Smoke Test Plaza',readBack.error?.message);
  const state = await user.rpc('patch_prospect', {target_org:orgId,target_parcel:readBack.data.id,patch:{notes:'Smoke note'},expected_notes:''});
  check('pipeline patch succeeds',!state.error,state.error?.message);
  const forbidden = await user.from('orgs').update({plan:'franchise'}).eq('id',orgId);
  check('billing entitlement cannot be changed by owner',!!forbidden.error);
  const cleanup = await user.rpc('clear_org_parcels',{target_org:orgId});
  check('cleans up smoke parcels', !cleanup.error,cleanup.error?.message);

  console.log(`\nAll ${passed} smoke checks passed.`);
}

main().catch((e) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
