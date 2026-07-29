import { describe, expect, it } from 'vitest';
import { estimate } from '../estimate';
import { buildContext, gradeOf, isLocalMailing, paneScore } from '../score';
import { DEFAULT_SETTINGS } from '../settings';
import type { ParcelInput, ScoringSettings } from '../types';

// The fixtures below are a Cincinnati territory. Locality markers are per-org
// settings (detected from the data on import, not hardcoded defaults), so the
// tests set them explicitly rather than relying on what a new org starts with.
const S: ScoringSettings = {
  ...DEFAULT_SETTINGS,
  localState: 'OH',
  localCity: 'Cincinnati',
  localZipPrefix: '45',
  regionState: 'OH',
};

const office = (over: Partial<ParcelInput> = {}): ParcelInput => ({
  address: '100 Main St',
  city: 'Cincinnati',
  zip: '45202',
  ownerName: 'QUEEN CITY COMMERCIAL LLC',
  ownerMailing: 'Cincinnati, OH 45202',
  landUse: 'Office',
  bldgSqft: 20000,
  stories: 2,
  marketValue: 2000000,
  ...over,
});

describe('paneScore', () => {
  it('produces the full five-factor breakdown, each within its weight', () => {
    const parcels = [office()];
    const ctx = buildContext(parcels);
    const b = paneScore(parcels[0], estimate(parcels[0], S), ctx, S);
    expect(b.parts.map((p) => p.label)).toEqual([
      'Contract value',
      'Building fit',
      'Buyer signal',
      'Portfolio',
      'Route density',
    ]);
    expect(b.parts.map((p) => p.max)).toEqual([30, 20, 20, 15, 15]);
    for (const p of b.parts) {
      expect(p.points).toBeGreaterThanOrEqual(0);
      expect(p.points).toBeLessThanOrEqual(p.max);
    }
    expect(b.total).toBeGreaterThanOrEqual(0);
    expect(b.total).toBeLessThanOrEqual(100);
  });

  it('matches hand-computed factor points for a known building', () => {
    // Single parcel: q = 1564 (see estimate test).
    // value = ln(1564/400)/ln(150) * 30 = (1.36358/5.01064)*30 = 8.1639 -> 8.2
    // fit: office (x1), 2 floors in [2..8] -> 20
    // buyer: owner .4 + local .3, median vps = own vps so NOT above -> 0.7*20 = 14
    // portfolio: 1 parcel -> 0
    // density: own zip 1/1 -> 15
    const parcels = [office()];
    const ctx = buildContext(parcels);
    const b = paneScore(parcels[0], estimate(parcels[0], S), ctx, S);
    expect(b.parts[0].points).toBeCloseTo(8.2, 5);
    expect(b.parts[1].points).toBe(20);
    expect(b.parts[2].points).toBeCloseTo(14, 5);
    expect(b.parts[3].points).toBe(0);
    expect(b.parts[4].points).toBe(15);
    expect(b.total).toBe(57); // round(8.1639+20+14+0+15) = round(57.16)
    expect(b.grade).toBe('B');
  });

  it('log-scales contract value with $400 -> 0 and $60,000 -> full weight', () => {
    const ctx = buildContext([office()]);
    const est = estimate(office(), S);
    const low = paneScore(office(), { ...est, annualQuarterly: 400 }, ctx, S);
    const high = paneScore(office(), { ...est, annualQuarterly: 60000 }, ctx, S);
    const above = paneScore(office(), { ...est, annualQuarterly: 200000 }, ctx, S);
    expect(low.parts[0].points).toBe(0);
    expect(high.parts[0].points).toBe(30);
    expect(above.parts[0].points).toBe(30); // clamped
  });

  it('penalizes warehouses and out-of-range floor counts', () => {
    const parcels = [
      office(),
      office({ landUse: 'Warehouse', address: 'w' }),
      office({ stories: 12, address: 't' }),
      office({ stories: 1, address: 's' }),
    ];
    const ctx = buildContext(parcels);
    const score = (p: ParcelInput) => paneScore(p, estimate(p, S), ctx, S);
    // Warehouse: 0.35 * 1 * 20 = 7
    expect(score(parcels[1]).parts[1].points).toBe(7);
    // 12 stories: 1 * max(.15, 1-(12-8)*.18) = 0.28 -> 5.6
    expect(score(parcels[2]).parts[1].points).toBeCloseTo(5.6, 5);
    // 1 story: 0.45 * 20 = 9
    expect(score(parcels[3]).parts[1].points).toBe(9);
    // In range: full 20
    expect(score(parcels[0]).parts[1].points).toBe(20);
  });

  it('gives the portfolio bonus across LLC name variations, capped at 4+', () => {
    const mk = (i: number, owner: string) => office({ address: `${i} Elm`, ownerName: owner });
    const parcels = [
      mk(1, 'MERIDIAN PROPERTY GROUP LLC'),
      mk(2, 'Meridian Property Group'),
      mk(3, 'MERIDIAN PROPERTIES LLC'),
      mk(4, 'MERIDIAN HOLDINGS, LLC'),
      mk(5, 'SOLO OWNER LLC'),
    ];
    const ctx = buildContext(parcels);
    expect(ctx.ownerCounts['meridian']).toBe(4);
    const b = paneScore(parcels[0], estimate(parcels[0], S), ctx, S);
    expect(b.parts[3].points).toBe(15); // min(1,(4-1)/3) = 1 -> full weight
    expect(b.parts[3].why).toBe('owner holds 4 parcels');
    const solo = paneScore(parcels[4], estimate(parcels[4], S), ctx, S);
    expect(solo.parts[3].points).toBe(0);
  });

  it('scores route density relative to the densest ZIP', () => {
    const parcels = [
      ...Array.from({ length: 4 }, (_, i) => office({ address: `${i} A St`, zip: '45202' })),
      office({ address: 'B', zip: '45208' }),
    ];
    const ctx = buildContext(parcels);
    expect(ctx.zipMax).toBe(4);
    const dense = paneScore(parcels[0], estimate(parcels[0], S), ctx, S);
    const sparse = paneScore(parcels[4], estimate(parcels[4], S), ctx, S);
    expect(dense.parts[4].points).toBe(15);
    expect(sparse.parts[4].points).toBe(3.8); // 15/4 = 3.75, displayed at 1 dp
  });

  it('buyer signal: uses territory median $/sqft, not hardcoded markets', () => {
    const cheap = office({ address: 'c', marketValue: 500000 }); // 25/sqft
    const rich = office({ address: 'r', marketValue: 4000000 }); // 200/sqft
    const mid = office({ address: 'm', marketValue: 2000000 }); // 100/sqft = median
    const ctx = buildContext([cheap, rich, mid]);
    expect(ctx.medianValuePerSqft).toBe(100);
    const score = (p: ParcelInput) => paneScore(p, estimate(p, S), ctx, S);
    // owner .4 + local .3 (+ .3 only if strictly above median)
    expect(score(rich).parts[2].points).toBeCloseTo(20, 5);
    expect(score(mid).parts[2].points).toBeCloseTo(14, 5);
    expect(score(cheap).parts[2].points).toBeCloseTo(14, 5);
  });

  it('grade boundaries: 70/55/40', () => {
    expect(gradeOf(70)).toBe('A');
    expect(gradeOf(69)).toBe('B');
    expect(gradeOf(55)).toBe('B');
    expect(gradeOf(54)).toBe('C');
    expect(gradeOf(40)).toBe('C');
    expect(gradeOf(39)).toBe('D');
    expect(gradeOf(0)).toBe('D');
  });
});

describe('isLocalMailing (configurable, replaces the prototype regex)', () => {
  it('matches configured Cincinnati markers like the prototype did', () => {
    expect(isLocalMailing('CINCINNATI, OH 45202', S)).toBe(true);
    expect(isLocalMailing('123 Elm St, Blue Ash OH', S)).toBe(true);
    expect(isLocalMailing('PO BOX 9, 45242', S)).toBe(true);
    expect(isLocalMailing('WILMINGTON, DE 19801', S)).toBe(false);
  });

  it('is fully driven by settings — works for another market', () => {
    const tx = { ...S, localState: 'TX', localCity: 'Austin', localZipPrefix: '787' };
    expect(isLocalMailing('AUSTIN, TX 78701', tx)).toBe(true);
    expect(isLocalMailing('CINCINNATI, OH 45202', tx)).toBe(false);
  });

  it('a brand-new workspace has no markers, so nothing is falsely local', () => {
    // Guards the old bug: Cincinnati defaults made out-of-state owners score
    // as local decision-makers for every non-Ohio company.
    expect(isLocalMailing('CINCINNATI, OH 45202', DEFAULT_SETTINGS)).toBe(false);
    expect(isLocalMailing('DENVER, CO 80202', DEFAULT_SETTINGS)).toBe(false);
  });

  it('does not false-positive the ZIP prefix inside street numbers', () => {
    // "4501 Elm" contains 45xx but only 5-digit groups count.
    expect(isLocalMailing('4501 Elm St, Lexington KY 40502', S)).toBe(false);
  });
});

/**
 * Two arithmetic defects found in review. Both silently distort ranking on the
 * data-sparse counties that make up most of the catalog.
 */
describe('scoring arithmetic defects', () => {
  it('does not apply the short-building penalty to an invented story count', () => {
    // Hamilton publishes no sq ft or stories, so every parcel was assumed to be
    // 1 story and then penalised 55% for being 1 story — crushing ground-floor
    // retail, banks and standalone medical offices, which are core prospects.
    const bare: ParcelInput = { address: '1 Retail Row', landUse: 'Retail', zip: '45202' };
    const ctx = buildContext([bare]);
    const est = estimate(bare, S);
    expect(est.storiesAssumed).toBe(true);

    const fit = paneScore(bare, est, ctx, S).parts.find((p) => p.label === 'Building fit')!;
    // retail multiplier 0.9 x weight 20, with no floor penalty applied.
    expect(fit.points).toBeCloseTo(18, 5);
  });

  it('still penalises a genuinely short building when the county said so', () => {
    const known: ParcelInput = { address: '1 Retail Row', landUse: 'Retail', bldgSqft: 9000, stories: 1 };
    const ctx = buildContext([known]);
    const est = estimate(known, S);
    expect(est.storiesAssumed).toBe(false);

    const fit = paneScore(known, est, ctx, S).parts.find((p) => p.label === 'Building fit')!;
    // 0.9 x 0.45 x 20 — the penalty is real information here, so it stands.
    expect(fit.points).toBeCloseTo(8.1, 5);
  });

  it('takes the true median value per sqft on an even-length territory', () => {
    // v[floor(len/2)] returns the upper element, biasing the "above median"
    // buyer signal so fewer buildings ever qualify.
    const mk = (mv: number): ParcelInput => ({ address: `${mv} St`, bldgSqft: 1, marketValue: mv });
    const ctx = buildContext([mk(1), mk(2), mk(3), mk(4)]);
    expect(ctx.medianValuePerSqft).toBe(2.5);
  });

  it('still takes the middle element on an odd-length territory', () => {
    const mk = (mv: number): ParcelInput => ({ address: `${mv} St`, bldgSqft: 1, marketValue: mv });
    expect(buildContext([mk(1), mk(2), mk(3)]).medianValuePerSqft).toBe(2);
  });
});
