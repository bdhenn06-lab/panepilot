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
  const membership = await user.from('org_members').select('org_id, role').limit(1).single();
  check('authenticated user has an org membership', !membership.error && !!membership.data?.org_id, membership.error?.message);
  const orgId = membership.data.org_id;

  const parcels = await user.from('parcels').select('id').eq('org_id', orgId);
  check('seeded parcels are visible to the member', !parcels.error && (parcels.data?.length ?? 0) >= 10, `got ${parcels.data?.length ?? 'error'}`);

  const pipeline = await user.from('prospect_state').select('parcel_id').eq('org_id', orgId);
  check('seeded pipeline state is visible', !pipeline.error && (pipeline.data?.length ?? 0) >= 1, `got ${pipeline.data?.length ?? 'error'}`);

  // 4. Import write path: insert a parcel, read it back, clean up ------------
  const marker = `SMOKE-${Date.now()}`;
  const insert = await user
    .from('parcels')
    .insert({
      org_id: orgId,
      parcel_number: marker,
      address: '1 Smoke Test Plaza',
      city: 'Cincinnati',
      zip: '45202',
      owner_name: 'Smoke Test LLC',
      owner_key: 'smoke test',
      land_use: 'Office',
      bldg_sqft: 50000,
      stories: 3,
      market_value: 2000000,
      year_built: 2000,
    })
    .select('id')
    .single();
  check('authenticated user can insert a parcel (import write path)', !insert.error && !!insert.data?.id, insert.error?.message);

  const readBack = await user.from('parcels').select('id, address').eq('parcel_number', marker).single();
  check('inserted parcel reads back', !readBack.error && readBack.data?.address === '1 Smoke Test Plaza', readBack.error?.message);

  const cleanup = await user.from('parcels').delete().eq('id', insert.data.id);
  check('cleanup deletes the test parcel', !cleanup.error, cleanup.error?.message);

  console.log(`\nAll ${passed} smoke checks passed.`);
}

main().catch((e) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
