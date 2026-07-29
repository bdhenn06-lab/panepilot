import { describe, expect, it } from 'vitest';
import { estimate } from '../estimate';
import { DEFAULT_SETTINGS } from '../settings';

const S = DEFAULT_SETTINGS;

describe('estimate (facade model)', () => {
  it('matches hand-computed values for a 20,000 sqft 2-story building', () => {
    // footprint = 10,000; width = sqrt(10000/1.8) = 74.5356
    // perimeter = 2 * (w + 1.8w) = 5.6w = 417.3995
    // glass = 417.3995 * 2 * 11 * 0.45 = 4132.256
    // windows = round(4132.256 / 21) = 197
    // price = max(150, round((4132.256*0.09 + 2*45)/5)*5) = round(92.38)*5 = 460
    const e = estimate({ address: 'x', bldgSqft: 20000, stories: 2 }, S);
    expect(e.glassSqft).toBeCloseTo(4132.256, 2);
    expect(e.windows).toBe(197);
    expect(e.panes).toBe(Math.round(197 * 1.8)); // 355
    expect(e.pricePerClean).toBe(460);
    expect(e.annualQuarterly).toBeCloseTo(460 * 4 * 0.85, 6); // 1564
    expect(e.annualMonthly).toBeCloseTo(460 * 12 * 0.72, 6); // 3974.4
    expect(e.assumed).toBe(false);
  });

  it('parses currency-formatted strings from county CSVs', () => {
    const a = estimate({ address: 'x', bldgSqft: '20,000', stories: '2' }, S);
    const b = estimate({ address: 'x', bldgSqft: 20000, stories: 2 }, S);
    expect(a).toEqual(b);
  });

  it('assumes stories from sq ft when stories column is missing', () => {
    expect(estimate({ address: 'x', bldgSqft: 50000 }, S).stories).toBe(3);
    expect(estimate({ address: 'x', bldgSqft: 20000 }, S).stories).toBe(2);
    expect(estimate({ address: 'x', bldgSqft: 8000 }, S).stories).toBe(1);
    expect(estimate({ address: 'x', bldgSqft: 50000 }, S).assumed).toBe(true);
  });

  it('assumes 8,000 sqft per story when sq ft is missing', () => {
    const e = estimate({ address: 'x', stories: 3 }, S);
    expect(e.bldgSqft).toBe(24000);
    expect(e.assumed).toBe(true);
  });

  it('falls back to a 1-story 8,000 sqft building when both are missing', () => {
    const e = estimate({ address: 'x' }, S);
    expect(e.stories).toBe(1);
    expect(e.bldgSqft).toBe(8000);
  });

  it('enforces the minimum job price', () => {
    const e = estimate({ address: 'x', bldgSqft: 400, stories: 1 }, S);
    expect(e.pricePerClean).toBe(S.minJob);
  });

  it('rounds price to the nearest $5', () => {
    for (const sqft of [12345, 23456, 34567, 45678]) {
      const e = estimate({ address: 'x', bldgSqft: sqft, stories: 2 }, S);
      expect(e.pricePerClean % 5).toBe(0);
    }
  });

  it('never returns fewer than 1 window', () => {
    const e = estimate({ address: 'x', bldgSqft: 1, stories: 1 }, S);
    expect(e.windows).toBeGreaterThanOrEqual(1);
  });

  it('responds to coefficient changes (window-to-wall ratio doubles glass)', () => {
    const base = estimate({ address: 'x', bldgSqft: 20000, stories: 2 }, S);
    const doubled = estimate(
      { address: 'x', bldgSqft: 20000, stories: 2 },
      { ...S, windowToWallPct: 90 },
    );
    expect(doubled.glassSqft).toBeCloseTo(base.glassSqft * 2, 6);
  });
});

/**
 * `assumed` goes true when EITHER sq ft or stories had to be invented, so it
 * can't tell the scorer which one. Story count specifically decides the
 * floor-fit penalty, and penalising a building for a floor count we made up
 * is the difference between "1-story retail" and "we have no idea".
 */
describe('estimate tracks which inputs were assumed', () => {
  it('flags stories as assumed only when the county had no story count', () => {
    const bothKnown = estimate({ address: 'x', bldgSqft: 20000, stories: 2 }, S);
    expect(bothKnown.assumed).toBe(false);
    expect(bothKnown.storiesAssumed).toBe(false);

    // Stories on file, sq ft missing: `assumed` is true but stories are real.
    const sqftMissing = estimate({ address: 'x', stories: 3 }, S);
    expect(sqftMissing.assumed).toBe(true);
    expect(sqftMissing.storiesAssumed).toBe(false);

    // Sq ft on file, stories missing: the story count is a guess.
    const storiesMissing = estimate({ address: 'x', bldgSqft: 20000 }, S);
    expect(storiesMissing.assumed).toBe(true);
    expect(storiesMissing.storiesAssumed).toBe(true);

    // Nothing on file — the Hamilton case.
    const nothing = estimate({ address: 'x' }, S);
    expect(nothing.assumed).toBe(true);
    expect(nothing.storiesAssumed).toBe(true);
  });

  it('flags assumed stories in residential mode too', () => {
    const R = { ...S, serviceMode: 'residential' as const };
    expect(estimate({ address: 'x', bldgSqft: 2400, stories: 2 }, R).storiesAssumed).toBe(false);
    expect(estimate({ address: 'x', bldgSqft: 2400 }, R).storiesAssumed).toBe(true);
  });
});
