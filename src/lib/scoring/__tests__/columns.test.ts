import { describe, expect, it } from 'vitest';
import { guessColumns } from '../columns';

/**
 * Header sets modeled on what the major assessor platforms actually publish.
 * PanePilot is sold nationwide, so the guesser has to survive more than the
 * one county it was first written against.
 */
describe('guessColumns across county export formats', () => {
  it('Tyler / iasWorld style (terse, separate prop and mail columns)', () => {
    const g = guessColumns([
      'PARID', 'PROPADDR', 'OWNERNAME', 'MAILADDR', 'MAILCITY', 'MAILZIP',
      'PROPCITY', 'PROPZIP', 'CLASSCD', 'SFLA', 'STORIES', 'YRBLT', 'TOTMKTVAL',
    ]);
    expect(g.parcelid).toBe('PARID');
    expect(g.address).toBe('PROPADDR');
    expect(g.owner).toBe('OWNERNAME');
    expect(g.mailing).toBe('MAILADDR');
    expect(g.city).toBe('PROPCITY');
    expect(g.zip).toBe('PROPZIP');
    expect(g.landuse).toBe('CLASSCD');
    expect(g.bldgsqft).toBe('SFLA');
    expect(g.stories).toBe('STORIES');
    expect(g.yearbuilt).toBe('YRBLT');
    expect(g.value).toBe('TOTMKTVAL');
  });

  it('Florida DOR "NAL" style (PHY_ prefix, JV value, OWN_ mailing)', () => {
    const g = guessColumns([
      'PARCEL_ID', 'OWN_NAME', 'OWN_ADDR1', 'OWN_CITY', 'OWN_ZIPCD',
      'PHY_ADDR1', 'PHY_CITY', 'PHY_ZIPCD', 'DOR_UC', 'TOT_LVG_AREA',
      'NO_RES_UNTS', 'JV', 'ACT_YR_BLT', 'EFF_YR_BLT',
    ]);
    expect(g.parcelid).toBe('PARCEL_ID');
    expect(g.owner).toBe('OWN_NAME');
    expect(g.address).toBe('PHY_ADDR1');
    expect(g.city).toBe('PHY_CITY');
    expect(g.zip).toBe('PHY_ZIPCD');
    expect(g.landuse).toBe('DOR_UC');
    expect(g.bldgsqft).toBe('TOT_LVG_AREA');
    expect(g.value).toBe('JV');
    expect(g.mailing).toBe('OWN_ADDR1');
    // Actual year built, not the effective/reassessed year.
    expect(g.yearbuilt).toBe('ACT_YR_BLT');
  });

  it('Texas CAD style (situs_ prefix, living_area)', () => {
    const g = guessColumns([
      'prop_id', 'geo_id', 'py_owner_name', 'situs_address', 'situs_city',
      'situs_zip', 'legal_desc', 'state_cd', 'living_area', 'num_stories',
      'market_value', 'yr_blt',
    ]);
    expect(g.parcelid).toBe('prop_id');
    expect(g.owner).toBe('py_owner_name');
    expect(g.address).toBe('situs_address');
    expect(g.city).toBe('situs_city');
    expect(g.zip).toBe('situs_zip');
    expect(g.bldgsqft).toBe('living_area');
    expect(g.stories).toBe('num_stories');
    expect(g.value).toBe('market_value');
    expect(g.yearbuilt).toBe('yr_blt');
    expect(g.landuse).toBe('state_cd');
  });

  it('ESRI parcel-layer style (CamelCase, lot size present)', () => {
    const g = guessColumns([
      'APN', 'SiteAddress', 'SiteCity', 'SiteZip', 'OwnerName', 'MailAddress',
      'MailCity', 'MailZip', 'UseCode', 'BuildingArea', 'LotSizeSqFt',
      'Stories', 'YearBuilt', 'TotalValue', 'Latitude', 'Longitude',
    ]);
    expect(g.parcelid).toBe('APN');
    expect(g.address).toBe('SiteAddress');
    expect(g.city).toBe('SiteCity');
    expect(g.zip).toBe('SiteZip');
    expect(g.owner).toBe('OwnerName');
    expect(g.mailing).toBe('MailAddress');
    expect(g.landuse).toBe('UseCode');
    expect(g.stories).toBe('Stories');
    expect(g.yearbuilt).toBe('YearBuilt');
    expect(g.value).toBe('TotalValue');
    expect(g.lat).toBe('Latitude');
    expect(g.lon).toBe('Longitude');
    // Lot area is land, not building — using it would inflate every estimate.
    expect(g.bldgsqft).toBe('BuildingArea');
  });

  it('CAGIS / Hamilton County (the original target) still maps', () => {
    const g = guessColumns([
      'PARCELID', 'SITE_ADDR', 'OWNER_NAME_1', 'MAIL_ADDR', 'LAND_USE_DSC',
      'BLDG_SQFT', 'STORIES', 'MKT_TOTAL_VAL', 'YR_BLT', 'ZIPCODE',
      'MUNICIPALITY', 'LATITUDE', 'LONGITUDE',
    ]);
    expect(g.address).toBe('SITE_ADDR');
    expect(g.owner).toBe('OWNER_NAME_1');
    expect(g.mailing).toBe('MAIL_ADDR');
    expect(g.landuse).toBe('LAND_USE_DSC');
    expect(g.bldgsqft).toBe('BLDG_SQFT');
    expect(g.value).toBe('MKT_TOTAL_VAL');
    expect(g.city).toBe('MUNICIPALITY');
    expect(g.zip).toBe('ZIPCODE');
  });

  it('the exported PanePilot CSV round-trips', () => {
    const g = guessColumns([
      'parcelid', 'address', 'city', 'zip', 'owner', 'mailing', 'landuse',
      'bldgsqft', 'stories', 'value', 'yearbuilt',
    ]);
    expect(g).toMatchObject({
      parcelid: 'parcelid', address: 'address', city: 'city', zip: 'zip',
      owner: 'owner', mailing: 'mailing', landuse: 'landuse',
      bldgsqft: 'bldgsqft', stories: 'stories', value: 'value',
      yearbuilt: 'yearbuilt',
    });
  });
});

describe('guessColumns precedence rules', () => {
  it('prefers the property city/ZIP even when mailing columns come first', () => {
    // Column order must not decide this: picking the owner's mailing city
    // would corrupt ZIP route density and every generated address.
    const g = guessColumns(['MAIL_CITY', 'MAIL_ZIP', 'SITUS_CITY', 'SITUS_ZIP']);
    expect(g.city).toBe('SITUS_CITY');
    expect(g.zip).toBe('SITUS_ZIP');
  });

  it('never maps a mailing column as the property address', () => {
    const g = guessColumns(['MAIL_ADDRESS', 'OWNER_ADDRESS', 'SITE_ADDRESS']);
    expect(g.address).toBe('SITE_ADDRESS');
  });

  it('never maps land/lot area as building area', () => {
    expect(guessColumns(['LAND_SQFT', 'BLDG_SQFT']).bldgsqft).toBe('BLDG_SQFT');
    expect(guessColumns(['ACREAGE', 'LOT_SQ_FT']).bldgsqft).toBe('');
  });

  it('never maps land-only or exempt value as market value', () => {
    expect(guessColumns(['LAND_VALUE', 'TOTAL_VALUE']).value).toBe('TOTAL_VALUE');
    expect(guessColumns(['EXEMPT_VALUE', 'MKT_TOTAL_VAL']).value).toBe('MKT_TOTAL_VAL');
    expect(guessColumns(['LAND_VALUE']).value).toBe('');
  });

  it('does not mistake an owner-name column for the owner mailing address', () => {
    const g = guessColumns(['OWNER_NAME', 'OWNER_ADDRESS']);
    expect(g.owner).toBe('OWNER_NAME');
    expect(g.mailing).toBe('OWNER_ADDRESS');
  });

  it('leaves unknown fields blank rather than guessing wildly', () => {
    const g = guessColumns(['col_a', 'col_b', 'col_c']);
    expect(g.address).toBe('');
    expect(g.owner).toBe('');
    expect(g.value).toBe('');
  });
});
