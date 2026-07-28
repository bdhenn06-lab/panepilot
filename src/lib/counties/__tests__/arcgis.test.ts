import { describe, expect, it } from 'vitest';
import {
  buildQueryUrl,
  composeField,
  coverageScore,
  coverageSummary,
  normalizeFeature,
  outFieldsFor,
} from '../arcgis';
import { COUNTY_SOURCES, findSource, searchSources } from '../registry';
import type { CountySource } from '../types';

const wake = findSource('nc-wake')!;
const hamilton = findSource('oh-hamilton-cagis')!;

/** URLSearchParams encodes spaces as "+", which decodeURIComponent leaves alone. */
const readable = (url: string) => decodeURIComponent(url).replace(/\+/g, ' ');

describe('composeField', () => {
  it('reads a single attribute', () => {
    expect(composeField({ SITE_ADDRESS: '100 Main St' }, 'SITE_ADDRESS')).toBe('100 Main St');
  });

  it('joins split address parts and collapses padding', () => {
    // Hamilton stores "3920 1/2" / "RIVER" / "RD" in three columns, padded.
    expect(
      composeField({ ADDRNO: '3920 1/2 ', ADDRST: ' RIVER', ADDRSF: 'RD' }, [
        'ADDRNO',
        'ADDRST',
        'ADDRSF',
      ]),
    ).toBe('3920 1/2 RIVER RD');
  });

  it('skips missing parts instead of leaving gaps', () => {
    expect(composeField({ A: 'X', B: null, C: 'Z' }, ['A', 'B', 'C'])).toBe('X Z');
    expect(composeField({}, ['A'])).toBe('');
    expect(composeField({ A: 'x' }, undefined)).toBe('');
  });

  it('collapses the trailing whitespace Ohio statewide pads addresses with', () => {
    expect(composeField({ S: '6366  CORBLY RD   ' }, 'S')).toBe('6366 CORBLY RD');
  });
});

describe('outFieldsFor', () => {
  it('collects every referenced attribute, deduped', () => {
    const fields = outFieldsFor(hamilton.fields);
    expect(fields).toContain('ADDRNO');
    expect(fields).toContain('OWNNM1');
    expect(fields).toContain('MKT_TOTAL_VAL');
    expect(new Set(fields).size).toBe(fields.length);
  });
});

describe('buildQueryUrl', () => {
  it('requests a filtered, ordered page without geometry', () => {
    const url = buildQueryUrl(wake, { mode: 'commercial', offset: 4000, limit: 2000 });
    expect(url).toContain(`${wake.serviceUrl}/query?`);
    expect(readable(url)).toContain(wake.where.commercial);
    expect(url).toContain('resultOffset=4000');
    expect(url).toContain('resultRecordCount=2000');
    expect(url).toContain('returnGeometry=false');
    // Paging without an order can repeat or drop rows between requests.
    expect(url).toContain('orderByFields=OBJECTID');
  });

  it('builds a count-only probe with no field list', () => {
    const url = buildQueryUrl(wake, { mode: 'commercial', countOnly: true });
    expect(url).toContain('returnCountOnly=true');
    expect(url).not.toContain('outFields');
  });

  it('uses the residential filter when asked', () => {
    const url = readable(buildQueryUrl(wake, { mode: 'residential' }));
    expect(url).toContain(wake.where.residential);
  });

  it('requests each parcel\'s own centroid in WGS84', () => {
    // A parcel's centroid geocodes it exactly and needs no city/ZIP to
    // disambiguate — several sources (Hamilton's CAGIS layer included)
    // publish neither, which broke Census street geocoding for those rows.
    const url = buildQueryUrl(wake, { mode: 'commercial' });
    expect(url).toContain('returnCentroid=true');
    expect(url).toContain('outSR=4326');
  });
});

describe('normalizeFeature', () => {
  it('maps a real Wake County row', () => {
    const row = normalizeFeature(
      {
        PIN_NUM: '0781234567',
        SITE_ADDRESS: '4000 GLENWOOD AVE',
        CITY_DECODE: 'RALEIGH',
        ZIPNUM: '27612',
        OWNER: 'GLENWOOD HOLDINGS LLC',
        ADDR1: 'PO BOX 100',
        LAND_CLASS_DECODE: 'Commercial',
        HEATEDAREA: 24000,
        TOTAL_VALUE_ASSD: 3100000,
        YEAR_BUILT: 1985,
      },
      wake,
    )!;
    expect(row).toMatchObject({
      parcel_number: '0781234567',
      address: '4000 GLENWOOD AVE',
      city: 'RALEIGH',
      zip: '27612',
      owner_name: 'GLENWOOD HOLDINGS LLC',
      land_use: 'Commercial',
      bldg_sqft: 24000,
      market_value: 3100000,
      year_built: 1985,
    });
  });

  it('composes the Hamilton address and leaves absent fields null', () => {
    const row = normalizeFeature(
      { PARCELID: '015900670081', ADDRNO: '3922', ADDRST: 'RIVER', ADDRSF: 'RD', CLASS: 400, MKT_TOTAL_VAL: 12040 },
      hamilton,
    )!;
    expect(row.address).toBe('3922 RIVER RD');
    expect(row.land_use).toBe('400');
    expect(row.market_value).toBe(12040);
    // CAGIS has no building size or situs ZIP.
    expect(row.bldg_sqft).toBeNull();
    expect(row.zip).toBeNull();
  });

  it('drops rows with no usable address', () => {
    expect(normalizeFeature({ OWNER: 'X' }, wake)).toBeNull();
    expect(normalizeFeature({ SITE_ADDRESS: '   ' }, wake)).toBeNull();
  });

  it('reads lat/lon from the feature centroid when the service returns one', () => {
    const withCentroid = normalizeFeature(
      { SITE_ADDRESS: '1 A St' },
      wake,
      { x: -84.6077, y: 39.0768 },
    )!;
    expect(withCentroid.lon).toBe(-84.6077);
    expect(withCentroid.lat).toBe(39.0768);

    // Older MapServer endpoints (e.g. Wake County) silently omit centroid.
    const without = normalizeFeature({ SITE_ADDRESS: '1 A St' }, wake)!;
    expect(without.lat).toBeNull();
    expect(without.lon).toBeNull();
  });

  it('normalizes ZIP+4 down to five digits', () => {
    const row = normalizeFeature({ SITE_ADDRESS: '1 A St', ZIPNUM: '27612-1403' }, wake)!;
    expect(row.zip).toBe('27612');
  });

  it('treats zero and unparseable numbers as absent', () => {
    const row = normalizeFeature(
      { SITE_ADDRESS: '1 A St', HEATEDAREA: 0, TOTAL_VALUE_ASSD: 'N/A' },
      wake,
    )!;
    expect(row.bldg_sqft).toBeNull();
    expect(row.market_value).toBeNull();
  });
});

describe('registry integrity', () => {
  it('every source is queryable and honestly described', () => {
    for (const s of COUNTY_SOURCES) {
      expect(s.id, `${s.label} id`).toMatch(/^[a-z0-9-]+$/);
      expect(s.state, `${s.label} state`).toMatch(/^[A-Z]{2}$/);
      expect(s.serviceUrl, `${s.label} url`).toMatch(
        /^https:\/\/.+\/(FeatureServer|MapServer)\/\d+$/i,
      );
      expect(s.fields.address, `${s.label} address`).toBeTruthy();
      expect(s.where.commercial, `${s.label} commercial filter`).toBeTruthy();
      expect(s.where.residential, `${s.label} residential filter`).toBeTruthy();
      // A source claiming a field must actually map it, or the badge lies.
      if (s.coverage.owner) expect(s.fields.owner, `${s.label} owner`).toBeTruthy();
      if (s.coverage.bldgSqft) expect(s.fields.bldgsqft, `${s.label} sqft`).toBeTruthy();
      if (s.coverage.value) expect(s.fields.value, `${s.label} value`).toBeTruthy();
      if (s.coverage.zip) expect(s.fields.zip, `${s.label} zip`).toBeTruthy();
    }
  });

  it('has unique ids', () => {
    const ids = COUNTY_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers all 88 Ohio counties plus the verified out-of-state control', () => {
    const ohio = new Set(COUNTY_SOURCES.filter((s) => s.state === 'OH').map((s) => s.county));
    expect(ohio.size).toBe(88);
    expect(ohio.has('Hamilton')).toBe(true);
    expect(findSource('nc-wake')).toBeDefined();
  });

  it('prefers the richer CAGIS source for Hamilton over the statewide fallback', () => {
    const hits = searchSources('Hamilton').filter((s) => s.state === 'OH');
    expect(hits[0].id).toBe('oh-hamilton-cagis');
    // The statewide layer must not also claim Hamilton, or the picker duplicates.
    expect(COUNTY_SOURCES.filter((s) => s.state === 'OH' && s.county === 'Hamilton')).toHaveLength(1);
  });

  it('search matches county and state, best coverage first', () => {
    expect(searchSources('wake')[0].id).toBe('nc-wake');
    const butler = searchSources('Butler');
    expect(butler.length).toBeGreaterThan(0);
    expect(butler[0].county).toBe('Butler');
  });
});

describe('coverage reporting', () => {
  it('summarizes what a source does and does not include', () => {
    expect(coverageSummary(wake)).toContain('owner names');
    const summary = coverageSummary(hamilton);
    expect(summary).toContain('owner names');
    expect(summary).toContain('no building size');
  });

  it('ranks richer sources higher', () => {
    const statewide = findSource('oh-butler-statewide') as CountySource;
    expect(coverageScore(wake)).toBeGreaterThan(coverageScore(hamilton));
    expect(coverageScore(hamilton)).toBeGreaterThan(coverageScore(statewide));
  });
});
