import { describe, expect, it } from 'vitest';
import { estimate } from '../estimate';
import { buildContext, deadFactors, paneScore, renormalizeSettings } from '../score';
import { DEFAULT_SETTINGS } from '../settings';
import type { ParcelInput, ScoringSettings } from '../types';

const S: ScoringSettings = { ...DEFAULT_SETTINGS, localState: 'OH', regionState: 'OH' };

const scoreAll = (parcels: ParcelInput[], s: ScoringSettings = S) => {
  const ctx = buildContext(parcels);
  return parcels.map((p) => paneScore(p, estimate(p, s), ctx, s));
};

/**
 * A factor that lands on the same number for every parcel cannot rank anything,
 * but it still consumes its share of the 100 points — so a county publishing no
 * owner or building size leaves most of the score frozen and every building
 * bunched into the same grade.
 */
describe('deadFactors', () => {
  it('spots the factors with no spread across a Hamilton-shaped territory', () => {
    // No sq ft, no stories, no owner, no value — address and land use only.
    const parcels: ParcelInput[] = [
      { address: '1 A St', landUse: 'Office', zip: '45202' },
      { address: '2 B St', landUse: 'Retail', zip: '45202' },
      { address: '3 C St', landUse: 'Warehouse', zip: '45202' },
    ];
    const dead = deadFactors(scoreAll(parcels));
    expect(dead).toContain('Contract value'); // identical fabricated price
    expect(dead).toContain('Buyer signal'); // no owner anywhere
    expect(dead).toContain('Portfolio'); // no owner anywhere
    expect(dead).toContain('Route density'); // all one ZIP
    // Land use still differentiates, so building fit is doing real work.
    expect(dead).not.toContain('Building fit');
  });

  it('reports nothing dead when every factor differentiates', () => {
    const parcels: ParcelInput[] = [
      { address: '1 A St', landUse: 'Office', zip: '45202', bldgSqft: 40000, stories: 4, ownerName: 'ALPHA LLC', ownerMailing: 'Cincinnati OH', marketValue: 5_000_000 },
      { address: '2 B St', landUse: 'Retail', zip: '45999', bldgSqft: 3000, stories: 1, ownerName: 'BETA LLC', ownerMailing: 'Denver CO', marketValue: 200_000 },
      { address: '3 C St', landUse: 'Warehouse', zip: '45202', bldgSqft: 90000, stories: 2, ownerName: 'ALPHA LLC', ownerMailing: 'Cincinnati OH', marketValue: 900_000 },
    ];
    expect(deadFactors(scoreAll(parcels))).toEqual([]);
  });

  it('treats a single-parcel territory as having nothing to compare', () => {
    expect(deadFactors(scoreAll([{ address: '1 A St', landUse: 'Office' }]))).toEqual([]);
  });
});

describe('renormalizeSettings', () => {
  it('moves dead weight onto the factors that still carry information', () => {
    const s2 = renormalizeSettings(S, ['Contract value', 'Portfolio']);
    expect(s2.weightValue).toBe(0);
    expect(s2.weightPortfolio).toBe(0);
    const total =
      s2.weightValue + s2.weightFit + s2.weightBuyer + s2.weightPortfolio + s2.weightDensity;
    expect(total).toBeCloseTo(100, 6);
    // Survivors keep their relative proportions: fit 20 and density 15 stay 4:3.
    expect(s2.weightFit / s2.weightDensity).toBeCloseTo(20 / 15, 6);
  });

  it('leaves settings alone when nothing is dead', () => {
    expect(renormalizeSettings(S, [])).toEqual(S);
  });

  it('refuses to zero out everything if somehow all factors are dead', () => {
    const all = ['Contract value', 'Building fit', 'Buyer signal', 'Portfolio', 'Route density'];
    expect(renormalizeSettings(S, all)).toEqual(S);
  });

  it('lets a sparse territory use the full grade range', () => {
    const parcels: ParcelInput[] = [
      { address: '1 A St', landUse: 'Office', zip: '45202' },
      { address: '2 B St', landUse: 'Warehouse', zip: '45202' },
    ];
    const before = scoreAll(parcels);
    const s2 = renormalizeSettings(S, deadFactors(before));
    const after = scoreAll(parcels, s2);
    // Same order, wider spread — the office pulls clear of the warehouse.
    expect(after[0].total).toBeGreaterThan(before[0].total);
    expect(after[0].total - after[1].total).toBeGreaterThan(before[0].total - before[1].total);
  });
});
