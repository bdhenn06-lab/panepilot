import { describe, expect, it } from 'vitest';
import { isCommercial, isResidential, parseNum, classifyUse } from '../classify';
import { firstName, ownerKey } from '../owner';
import { guessColumns } from '../columns';
import { coordOf, orderStops } from '../route';

describe('parseNum', () => {
  it('handles county CSV formats', () => {
    expect(parseNum('$1,234,500')).toBe(1234500);
    expect(parseNum('20,000')).toBe(20000);
    expect(parseNum('3')).toBe(3);
    expect(parseNum('')).toBe(0);
    expect(parseNum(null)).toBe(0);
    expect(parseNum('N/A')).toBe(0);
  });
});

describe('isCommercial', () => {
  it('numeric land-use codes: 300-499 are commercial/industrial', () => {
    expect(isCommercial('401')).toBe(true);
    expect(isCommercial('300')).toBe(true);
    expect(isCommercial('499')).toBe(true);
    expect(isCommercial('510')).toBe(false); // residential
    expect(isCommercial('299')).toBe(false);
    expect(isCommercial(425)).toBe(true);
  });
  it('text land uses match by keyword', () => {
    for (const good of ['Office', 'RETAIL STORE', 'Medical Clinic', 'Hotel', 'Warehouse', 'Mixed Use', 'Restaurant', 'Commercial vacant']) {
      expect(isCommercial(good), good).toBe(true);
    }
    for (const bad of ['Single Family Residence', 'Agricultural', 'Vacant land', null, '']) {
      expect(isCommercial(bad), String(bad)).toBe(false);
    }
  });
});

describe('isResidential', () => {
  it('numeric land-use codes: 500-599 are residential', () => {
    expect(isResidential('510')).toBe(true);
    expect(isResidential('500')).toBe(true);
    expect(isResidential('599')).toBe(true);
    expect(isResidential('499')).toBe(false); // commercial range
    expect(isResidential('600')).toBe(false);
    expect(isResidential(510)).toBe(true);
  });
  it('text land uses match single-family/condo/small multi-family keywords', () => {
    for (const good of [
      'SINGLE FAMILY DWLG', 'Duplex', 'Triplex', 'Fourplex', 'Condominium',
      'Townhouse', 'Manufactured Home', 'Mobile Home', 'Residential',
    ]) {
      expect(isResidential(good), good).toBe(true);
    }
  });
  it('excludes vacant land and large apartment buildings', () => {
    for (const bad of [
      'RESIDENTIAL VACANT LAND', 'COMMERCIAL VACANT LAND', 'APARTMENT, 4-19 UNITS',
      'APARTMENT, 40+ UNITS', 'Office', 'Warehouse', null, '',
    ]) {
      expect(isResidential(bad), String(bad)).toBe(false);
    }
  });
});

describe('classifyUse', () => {
  it('classifies with the prototype multipliers', () => {
    expect(classifyUse('Professional Office Building')).toEqual({ kind: 'office', multiplier: 1 });
    expect(classifyUse('Dental Clinic')).toEqual({ kind: 'medical', multiplier: 1 });
    expect(classifyUse('Motel')).toEqual({ kind: 'hotel', multiplier: 1 });
    expect(classifyUse('Supermarket')).toEqual({ kind: 'retail', multiplier: 0.9 });
    expect(classifyUse('Mixed use residential')).toEqual({ kind: 'mixed', multiplier: 0.75 });
    expect(classifyUse('Self Storage')).toEqual({ kind: 'industrial', multiplier: 0.35 });
    expect(classifyUse('447')).toEqual({ kind: 'commercial', multiplier: 0.9 });
    expect(classifyUse('350')).toEqual({ kind: 'industrial', multiplier: 0.35 });
    expect(classifyUse('something else')).toEqual({ kind: 'commercial', multiplier: 0.8 });
  });
});

describe('ownerKey', () => {
  it('collapses legal-form variations of one name', () => {
    // Only boilerplate is dropped. This previously stripped "property",
    // "group" and "holdings" too, which merged MERIDIAN PROPERTY GROUP with
    // MERIDIAN HOLDINGS — two names that may well be unrelated owners.
    expect(ownerKey('MERIDIAN PROPERTY GROUP LLC')).toBe('meridian property group');
    expect(ownerKey('Meridian Property Group')).toBe('meridian property group');
    expect(ownerKey('MERIDIAN HOLDINGS, LLC')).toBe('meridian holdings');
    // Trust and trustee are the same entity written two ways, so they merge.
    expect(ownerKey('The Kessler Family Trust')).toBe('kessler family trust');
    expect(ownerKey('KESSLER FAMILY TRUSTEE')).toBe('kessler family trust');
  });
  it('empty and entity-only names produce empty keys', () => {
    expect(ownerKey('')).toBe('');
    expect(ownerKey(null)).toBe('');
    expect(ownerKey('LLC')).toBe('');
  });
});

describe('firstName', () => {
  it('extracts a salutation or falls back to "there"', () => {
    expect(firstName('SMITH, JOHN')).toBe('SMITH');
    expect(firstName('LLC HOLDINGS')).toBe('there');
    expect(firstName('')).toBe('there');
  });
});

describe('guessColumns (county header auto-detection)', () => {
  it('maps CAGIS-style headers', () => {
    const g = guessColumns([
      'PARCELID', 'SITE_ADDR', 'OWNER_NAME_1', 'MAIL_ADDR', 'LAND_USE_DSC',
      'BLDG_SQFT', 'STORIES', 'MKT_TOTAL_VAL', 'YR_BLT', 'ZIPCODE', 'MUNICIPALITY',
      'LATITUDE', 'LONGITUDE',
    ]);
    expect(g.address).toBe('SITE_ADDR');
    expect(g.owner).toBe('OWNER_NAME_1');
    expect(g.mailing).toBe('MAIL_ADDR');
    expect(g.landuse).toBe('LAND_USE_DSC');
    expect(g.bldgsqft).toBe('BLDG_SQFT');
    expect(g.stories).toBe('STORIES');
    expect(g.value).toBe('MKT_TOTAL_VAL');
    expect(g.yearbuilt).toBe('YR_BLT');
    expect(g.zip).toBe('ZIPCODE');
    expect(g.city).toBe('MUNICIPALITY');
    expect(g.parcelid).toBe('PARCELID');
    expect(g.lat).toBe('LATITUDE');
    expect(g.lon).toBe('LONGITUDE');
  });
  it('maps a different county naming convention', () => {
    const g = guessColumns(['pin', 'property_address', 'deeded_owner', 'class', 'total_sq_ft', 'floors', 'appraised_value']);
    expect(g.address).toBe('property_address');
    expect(g.owner).toBe('deeded_owner');
    expect(g.landuse).toBe('class');
    expect(g.bldgsqft).toBe('total_sq_ft');
    expect(g.stories).toBe('floors');
    expect(g.value).toBe('appraised_value');
    expect(g.parcelid).toBe('pin');
    expect(g.lat).toBe('');
  });
  it('maps a bare "value" header', () => {
    expect(guessColumns(['address', 'owner', 'value']).value).toBe('value');
    expect(guessColumns(['address', 'market_value']).value).toBe('market_value');
  });
});

describe('route helpers', () => {
  it('validates continental-US coordinates', () => {
    expect(coordOf({ lat: 39.1, lon: -84.5 })).toEqual([39.1, -84.5]);
    expect(coordOf({ lat: '39.1', lon: '-84.5' })).toEqual([39.1, -84.5]);
    expect(coordOf({ lat: 0, lon: 0 })).toBeNull();
    expect(coordOf({ lat: 55, lon: -84.5 })).toBeNull();
    expect(coordOf({})).toBeNull();
  });

  it('orders stops nearest-neighbor from the first stop', () => {
    const stops = [
      { id: 'start', coord: [39.0, -84.5] as [number, number] },
      { id: 'far', coord: [39.5, -84.5] as [number, number] },
      { id: 'near', coord: [39.1, -84.5] as [number, number] },
      { id: 'mid', coord: [39.3, -84.5] as [number, number] },
    ];
    expect(orderStops(stops).map((s) => s.id)).toEqual(['start', 'near', 'mid', 'far']);
  });

  it('keeps manual order when any stop lacks coordinates', () => {
    const stops = [
      { id: 'a', coord: [39.0, -84.5] as [number, number] },
      { id: 'b', coord: null },
      { id: 'c', coord: [39.1, -84.5] as [number, number] },
    ];
    expect(orderStops(stops).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});
