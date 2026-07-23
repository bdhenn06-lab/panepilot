import { describe, expect, it } from 'vitest';
import { estimate } from '../estimate';
import { buildContext, paneScore } from '../score';
import { classifyUse } from '../classify';
import { DEFAULT_SETTINGS, defaultsForMode } from '../settings';
import type { ParcelInput } from '../types';

const S = { ...DEFAULT_SETTINGS, ...defaultsForMode('residential') };

const home = (over: Partial<ParcelInput> = {}): ParcelInput => ({
  address: '100 Main St',
  city: 'Cincinnati',
  zip: '45208',
  ownerName: 'JANE HOMEOWNER',
  ownerMailing: 'Cincinnati, OH 45208',
  landUse: 'SINGLE FAMILY DWLG',
  bldgSqft: 2200,
  stories: 2,
  marketValue: 300000,
  ...over,
});

describe('defaultsForMode', () => {
  it('gives residential mode a much smaller value scale than commercial', () => {
    const res = defaultsForMode('residential');
    const comm = defaultsForMode('commercial');
    expect(res.valueCeil!).toBeLessThan(comm.valueCeil!);
    expect(res.serviceMode).toBe('residential');
    expect(comm.serviceMode).toBe('commercial');
  });
});

describe('paneScore in residential mode', () => {
  it('uses the configurable value-floor/ceil anchors, not the commercial ones', () => {
    const parcels = [home()];
    const ctx = buildContext(parcels);
    const est = estimate(parcels[0], S);
    const atFloor = paneScore(parcels[0], { ...est, annualQuarterly: S.valueFloor }, ctx, S);
    const atCeil = paneScore(parcels[0], { ...est, annualQuarterly: S.valueCeil }, ctx, S);
    expect(atFloor.parts[0].points).toBe(0);
    expect(atCeil.parts[0].points).toBe(S.weightValue);
  });

  it('does not dampen building fit by story count (floorFit neutral)', () => {
    const oneStory = home({ address: 'a', stories: 1 });
    const tenStory = home({ address: 'b', stories: 10 }); // would tank a commercial score
    const ctx = buildContext([oneStory, tenStory]);
    const scoreOf = (p: ParcelInput) => paneScore(p, estimate(p, S), ctx, S);
    // Building-fit points should equal the use-class multiplier alone (x weightFit),
    // unaffected by story count.
    const uc = classifyUse(oneStory.landUse);
    expect(scoreOf(oneStory).parts[1].points).toBeCloseTo(uc.multiplier * S.weightFit, 5);
    expect(scoreOf(tenStory).parts[1].points).toBeCloseTo(uc.multiplier * S.weightFit, 5);
  });

  it('still runs buyer signal, portfolio, and route density factors normally', () => {
    const parcels = [
      home({ address: '1 Elm', ownerName: 'SAME OWNER LLC' }),
      home({ address: '2 Elm', ownerName: 'SAME OWNER LLC' }),
    ];
    const ctx = buildContext(parcels);
    const b = paneScore(parcels[0], estimate(parcels[0], S), ctx, S);
    expect(b.parts[2].points).toBeGreaterThan(0); // buyer signal
    expect(b.parts[3].points).toBeGreaterThan(0); // portfolio (2 properties, same owner)
    expect(b.parts[4].points).toBeGreaterThan(0); // route density
  });
});

describe('classifyUse residential branches', () => {
  it('classifies single-family, condo/townhome, and small multi-family', () => {
    expect(classifyUse('SINGLE FAMILY DWLG')).toEqual({ kind: 'single_family', multiplier: 1 });
    expect(classifyUse('Manufactured Home')).toEqual({ kind: 'single_family', multiplier: 1 });
    expect(classifyUse('Condominium')).toEqual({ kind: 'condo_townhome', multiplier: 0.85 });
    expect(classifyUse('Townhouse')).toEqual({ kind: 'condo_townhome', multiplier: 0.85 });
    expect(classifyUse('Duplex')).toEqual({ kind: 'small_multifamily', multiplier: 0.9 });
    expect(classifyUse('Fourplex')).toEqual({ kind: 'small_multifamily', multiplier: 0.9 });
    expect(classifyUse('510')).toEqual({ kind: 'single_family', multiplier: 1 });
  });

  it('leaves existing commercial classifications unchanged', () => {
    expect(classifyUse('Professional Office Building')).toEqual({ kind: 'office', multiplier: 1 });
    expect(classifyUse('447')).toEqual({ kind: 'commercial', multiplier: 0.9 });
    expect(classifyUse('350')).toEqual({ kind: 'industrial', multiplier: 0.35 });
    expect(classifyUse('Mixed use residential')).toEqual({ kind: 'mixed', multiplier: 0.75 });
  });
});
