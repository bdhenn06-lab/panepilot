import { describe, expect, it } from 'vitest';
import { estimate } from '../estimate';
import { buildContext } from '../score';
import { jobThesis } from '../thesis';
import { DEFAULT_SETTINGS } from '../settings';
import type { ParcelInput, ScoringSettings } from '../types';

/**
 * The thesis is what the operator actually reads — dollars, crew time, and one
 * reason to knock. These tests pin the parts that would quietly mislead someone
 * bidding a job: the price band, the crew estimate, and honest confidence when
 * the county gave us nothing to work with.
 */
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

const thesisFor = (parcels: ParcelInput[], s: ScoringSettings = S, idx = 0) => {
  const ctx = buildContext(parcels);
  const p = parcels[idx];
  return jobThesis(p, estimate(p, s), ctx, s);
};

describe('jobThesis pricing', () => {
  it('brackets the estimator price inside a quote band', () => {
    const p = office();
    const est = estimate(p, S);
    const t = thesisFor([p]);
    expect(t.priceLow).toBeLessThanOrEqual(est.pricePerClean);
    expect(t.priceHigh).toBeGreaterThanOrEqual(est.pricePerClean);
    // A band nobody could act on is worse than no band.
    expect(t.priceLow).toBeGreaterThan(0);
    expect(t.priceHigh).toBeGreaterThan(t.priceLow);
  });

  it('carries the recurring annual value through unchanged', () => {
    const p = office();
    expect(thesisFor([p]).annualValue).toBe(estimate(p, S).annualQuarterly);
  });

  it('never quotes below the org minimum job price', () => {
    const t = thesisFor([office({ bldgSqft: 200, stories: 1 })]);
    expect(t.priceLow).toBeGreaterThanOrEqual(S.minJob * 0.8);
  });
});

describe('jobThesis crew time', () => {
  it('scales with building size and always lands on a usable range', () => {
    const small = thesisFor([office({ bldgSqft: 5000 })]);
    const big = thesisFor([office({ bldgSqft: 80000 })]);
    expect(small.crewHoursLow).toBeGreaterThan(0);
    expect(big.crewHoursLow).toBeGreaterThan(small.crewHoursLow);
    expect(big.crewHoursHigh).toBeGreaterThan(big.crewHoursLow);
  });

  it('estimates residential from window count, not glass area', () => {
    const R: ScoringSettings = { ...S, serviceMode: 'residential' };
    const home = office({ landUse: 'Single Family', bldgSqft: 2400, stories: 2 });
    const t = thesisFor([home], R);
    // Residential sets glassSqft to 0, so a glass-area formula would divide to nothing.
    expect(t.crewHoursLow).toBeGreaterThan(0);
    expect(t.crewNote).toMatch(/crew/i);
  });
});

describe('jobThesis headline reason', () => {
  it('leads with the portfolio when one owner holds several parcels', () => {
    const parcels = [
      office({ address: '1 A St' }),
      office({ address: '2 B St' }),
      office({ address: '3 C St' }),
    ];
    expect(thesisFor(parcels).headline).toMatch(/3 properties/i);
  });

  it('falls back to route density when the owner is a one-off', () => {
    const parcels = [
      office({ address: '1 A St', ownerName: 'ALPHA LLC', ownerMailing: '', marketValue: 0 }),
      office({ address: '2 B St', ownerName: 'BETA LLC', ownerMailing: '', marketValue: 0 }),
      office({ address: '3 C St', ownerName: 'GAMMA LLC', ownerMailing: '', marketValue: 0 }),
    ];
    expect(thesisFor(parcels).headline).toMatch(/45202|route|nearby/i);
  });

  it('still produces a reason with no owner and no value on file', () => {
    const bare: ParcelInput = { address: '9 Nowhere Rd', landUse: 'Office', bldgSqft: 12000 };
    const t = thesisFor([bare]);
    expect(t.headline.length).toBeGreaterThan(0);
    expect(t.headline).not.toMatch(/undefined|null|NaN/);
  });
});

describe('jobThesis confidence', () => {
  it('is high when size and owner both came from the county', () => {
    const t = thesisFor([office()]);
    expect(t.confidence).toBe('high');
  });

  it('drops to low when the building size had to be assumed', () => {
    const t = thesisFor([office({ bldgSqft: null, stories: null })]);
    expect(t.confidence).toBe('low');
    expect(t.confidenceWhy).toMatch(/assum|size/i);
  });

  it('is medium when size is real but nobody is on file to call', () => {
    const t = thesisFor([office({ ownerName: null, ownerMailing: null })]);
    expect(t.confidence).toBe('medium');
    expect(t.confidenceWhy).toMatch(/owner/i);
  });

  it('never emits a placeholder in the confidence note', () => {
    for (const p of [office(), office({ bldgSqft: null }), office({ ownerName: null })]) {
      expect(thesisFor([p]).confidenceWhy).not.toMatch(/undefined|null|NaN/);
    }
  });
});

describe('jobThesis applies hours calibration', () => {
  it('widens the crew estimate toward what these jobs actually took', () => {
    const p = office();
    const base = thesisFor([p]);
    const ctx = buildContext([p]);
    const est = estimate(p, S);
    const calibrated = jobThesis(p, est, ctx, S, {
      priceMultiplier: {},
      hoursMultiplier: { office: 1.5 },
    });
    expect(calibrated.crewHoursLow).toBeGreaterThan(base.crewHoursLow);
  });

  it('leaves hours unchanged with no calibration for this use class', () => {
    const p = office();
    const ctx = buildContext([p]);
    const est = estimate(p, S);
    const base = jobThesis(p, est, ctx, S);
    const noop = jobThesis(p, est, ctx, S, { priceMultiplier: {}, hoursMultiplier: {} });
    expect(noop.crewHoursLow).toBe(base.crewHoursLow);
    expect(noop.crewHoursHigh).toBe(base.crewHoursHigh);
  });
});
