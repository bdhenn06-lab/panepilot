import { describe, expect, it } from 'vitest';
import { estimate } from '../estimate';
import { DEFAULT_SETTINGS } from '../settings';

const S = { ...DEFAULT_SETTINGS, serviceMode: 'residential' as const };

describe('estimate (residential facade model)', () => {
  it('matches hand-computed values for a 2,000 sqft 2-story home', () => {
    // windows = round(2000/130) = 15
    // upperStorySurcharge = 1 + (2-1)*0.25 = 1.25
    // pricePerClean = round(15*9*1.25/5)*5 = round(168.75/5)*5 = 170
    const e = estimate({ address: 'x', bldgSqft: 2000, stories: 2 }, S);
    expect(e.windows).toBe(15);
    expect(e.pricePerClean).toBe(170);
    expect(e.panes).toBe(Math.round(15 * 1.8)); // 27
    expect(e.annualQuarterly).toBeCloseTo(170 * 4 * 0.85, 6); // 578
    expect(e.annualMonthly).toBeCloseTo(170 * 12 * 0.72, 6); // 1468.8
    expect(e.glassSqft).toBe(0); // not a meaningful figure for this model
    expect(e.assumed).toBe(false);
  });

  it('assumes 1 story for homes under 1,600 sqft, 2 stories above', () => {
    expect(estimate({ address: 'x', bldgSqft: 1200 }, S).stories).toBe(1);
    expect(estimate({ address: 'x', bldgSqft: 1599 }, S).stories).toBe(1);
    expect(estimate({ address: 'x', bldgSqft: 1601 }, S).stories).toBe(2);
    expect(estimate({ address: 'x', bldgSqft: 3000 }, S).stories).toBe(2);
    expect(estimate({ address: 'x', bldgSqft: 1200 }, S).assumed).toBe(true);
  });

  it('assumes 1,200 sqft per story when sq ft is missing', () => {
    const e = estimate({ address: 'x', stories: 1 }, S);
    expect(e.bldgSqft).toBe(1200);
    expect(e.assumed).toBe(true);
  });

  it('falls back to a 1-story 1,200 sqft home when both are missing', () => {
    const e = estimate({ address: 'x' }, S);
    expect(e.stories).toBe(1);
    expect(e.bldgSqft).toBe(1200);
  });

  it('has no upper-story surcharge for single-story homes', () => {
    const e = estimate({ address: 'x', bldgSqft: 1200, stories: 1 }, S);
    // windows = round(1200/130) = 9; price = round(9*9*1/5)*5 = 80 -> hits minJob floor
    expect(e.pricePerClean).toBe(S.minJob);
  });

  it('applies the upper-story surcharge multiplicatively per story above the first', () => {
    const oneStory = estimate({ address: 'x', bldgSqft: 6000, stories: 1 }, S);
    const twoStory = estimate({ address: 'x', bldgSqft: 6000, stories: 2 }, S);
    const threeStory = estimate({ address: 'x', bldgSqft: 6000, stories: 3 }, S);
    // Same window count (bldgSqft-driven, not story-driven); price scales by
    // (1 + extraStories * 0.25).
    expect(twoStory.windows).toBe(oneStory.windows);
    expect(twoStory.pricePerClean / oneStory.pricePerClean).toBeCloseTo(1.25, 1);
    expect(threeStory.pricePerClean / oneStory.pricePerClean).toBeCloseTo(1.5, 1);
  });

  it('enforces the minimum job price', () => {
    const e = estimate({ address: 'x', bldgSqft: 100, stories: 1 }, S);
    expect(e.pricePerClean).toBe(S.minJob);
  });

  it('rounds price to the nearest $5', () => {
    for (const sqft of [1345, 2456, 3567, 4678]) {
      const e = estimate({ address: 'x', bldgSqft: sqft, stories: 2 }, S);
      expect(e.pricePerClean % 5).toBe(0);
    }
  });

  it('never returns fewer than 1 window', () => {
    const e = estimate({ address: 'x', bldgSqft: 1, stories: 1 }, S);
    expect(e.windows).toBeGreaterThanOrEqual(1);
  });

  it('responds to coefficient changes ($/window doubles price proportionally)', () => {
    const base = estimate({ address: 'x', bldgSqft: 6000, stories: 1 }, S);
    const doubled = estimate({ address: 'x', bldgSqft: 6000, stories: 1 }, { ...S, resPricePerWindow: S.resPricePerWindow * 2 });
    expect(doubled.pricePerClean / base.pricePerClean).toBeCloseTo(2, 1);
  });

  it('does not affect commercial-mode estimates (default serviceMode)', () => {
    // Sanity check that the branch actually depends on serviceMode.
    const commercial = estimate({ address: 'x', bldgSqft: 2000, stories: 2 }, DEFAULT_SETTINGS);
    const residential = estimate({ address: 'x', bldgSqft: 2000, stories: 2 }, S);
    expect(commercial.pricePerClean).not.toBe(residential.pricePerClean);
    expect(commercial.glassSqft).toBeGreaterThan(0);
    expect(residential.glassSqft).toBe(0);
  });
});
