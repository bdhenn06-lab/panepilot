/**
 * Deterministic sample Cincinnati territory — enough parcels for the core loop
 * (ranked list, portfolios, map, follow-ups) without a county import.
 */
import type { OrgRow, ParcelRow } from '@/lib/db/types';
import { DEFAULT_SETTINGS, ownerKey, type ScoringSettings } from '@/lib/scoring';

let seed = 42;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
function ri(a: number, b: number) {
  return Math.floor(a + rnd() * (b - a + 1));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

const ZONES = [
  { zip: '45202', city: 'Cincinnati', lat: 39.103, lon: -84.512, n: 10 },
  { zip: '45242', city: 'Blue Ash', lat: 39.248, lon: -84.378, n: 8 },
  { zip: '45208', city: 'Cincinnati', lat: 39.135, lon: -84.435, n: 6 },
  { zip: '45040', city: 'Mason', lat: 39.36, lon: -84.31, n: 4 },
];
const STREETS = ['Madison Rd', 'Montgomery Rd', 'Vine St', 'Kenwood Rd', 'Main St'];
const USES = ['Office', 'Office', 'Medical Office', 'Retail Store', 'Bank', 'Hotel', 'Warehouse'];
const OWNERS = [
  'MERIDIAN PROPERTY GROUP LLC',
  'TRISTATE HOLDINGS LLC',
  'QUEEN CITY COMMERCIAL LLC',
  'KESSLER FAMILY TRUST',
  'RIVERBEND REALTY INC',
  'OAKWOOD INVESTMENTS LLC',
];

export const DEMO_COOKIE = 'pp_demo';

export const DEMO_ORG: OrgRow = {
  id: 'demo',
  name: 'Sample territory',
  plan: 'trial',
  created_at: '2026-01-01T00:00:00.000Z',
};

export const DEMO_SETTINGS: ScoringSettings = {
  ...DEFAULT_SETTINGS,
  localState: 'OH',
  localCity: 'Cincinnati',
  localZipPrefix: '45',
  regionState: 'OH',
  companyName: 'Whiteline Window Washing',
  contactName: 'Alex Rivera',
  contactPhone: '(513) 555-0142',
  contactEmail: 'alex@whiteline.example',
  homeBase: '1200 Madison Rd, Cincinnati, OH 45202',
};

export function sampleParcels(orgId = 'demo'): ParcelRow[] {
  seed = 42;
  const rows: ParcelRow[] = [];
  let id = 1;
  for (const z of ZONES) {
    for (let i = 0; i < z.n; i++) {
      const use = pick(USES);
      const stories = use === 'Warehouse' ? 1 : ri(1, use === 'Hotel' ? 9 : 6);
      const sqft = stories * ri(4, 16) * 1000;
      const owner = rnd() < 0.35 ? pick(OWNERS.slice(0, 3)) : pick(OWNERS);
      rows.push({
        id: id++,
        org_id: orgId,
        parcel_number: `SAMPLE-${z.zip}-${i}`,
        address: `${ri(1000, 9900)} ${pick(STREETS)}`,
        city: z.city,
        zip: z.zip,
        owner_name: owner,
        owner_key: ownerKey(owner) || null,
        owner_mailing: rnd() < 0.7 ? `${z.city}, OH ${z.zip}` : 'WILMINGTON, DE 19801',
        land_use: use,
        bldg_sqft: sqft,
        stories: rnd() < 0.8 ? stories : null,
        market_value: sqft * ri(70, 190),
        year_built: ri(1958, 2022),
        lat: z.lat + (rnd() - 0.5) * 0.02,
        lon: z.lon + (rnd() - 0.5) * 0.025,
      });
    }
  }
  return rows;
}
