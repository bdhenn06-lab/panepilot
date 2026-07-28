import { coverageScore } from './arcgis';
import type { CountySource } from './types';

/**
 * The county data catalog.
 *
 * Kept in code rather than the database: it's version-controlled, needs no
 * admin UI, and adding a county is a small edit that auto-deploys on push.
 *
 * Every entry here was verified against the live service — field names, filters
 * and record counts all checked before being added. Counties whose published
 * data turned out to be unusable are deliberately absent rather than shipped
 * broken; the CSV upload and live discovery cover those.
 */

/** Ohio publishes one statewide parcel layer covering all 88 counties. */
const OHIO_STATEWIDE_URL =
  'https://services2.arcgis.com/MlJ0G8iWUyC7jAmu/ArcGIS/rest/services/OhioStatewidePacels_full_view/FeatureServer/0';

// StateLUC arrives as "401: Com-Apartment- 4 to 19" — code plus description.
// x00 codes are vacant land in the Ohio scheme, so they're excluded.
const OHIO_COMMERCIAL = `(StateLUC LIKE '3%' OR StateLUC LIKE '4%') AND StateLUC NOT LIKE '300:%' AND StateLUC NOT LIKE '400:%'`;
const OHIO_RESIDENTIAL = `StateLUC LIKE '5%' AND StateLUC NOT LIKE '500:%'`;

const OHIO_COUNTIES = [
  'Adams', 'Allen', 'Ashland', 'Ashtabula', 'Athens', 'Auglaize', 'Belmont', 'Brown',
  'Butler', 'Carroll', 'Champaign', 'Clark', 'Clermont', 'Clinton', 'Columbiana',
  'Coshocton', 'Crawford', 'Cuyahoga', 'Darke', 'Defiance', 'Delaware', 'Erie',
  'Fairfield', 'Fayette', 'Franklin', 'Fulton', 'Gallia', 'Geauga', 'Greene',
  'Guernsey', 'Hamilton', 'Hancock', 'Hardin', 'Harrison', 'Henry', 'Highland',
  'Hocking', 'Holmes', 'Huron', 'Jackson', 'Jefferson', 'Knox', 'Lake', 'Lawrence',
  'Licking', 'Logan', 'Lorain', 'Lucas', 'Madison', 'Mahoning', 'Marion', 'Medina',
  'Meigs', 'Mercer', 'Miami', 'Monroe', 'Montgomery', 'Morgan', 'Morrow', 'Muskingum',
  'Noble', 'Ottawa', 'Paulding', 'Perry', 'Pickaway', 'Pike', 'Portage', 'Preble',
  'Putnam', 'Richland', 'Ross', 'Sandusky', 'Scioto', 'Seneca', 'Shelby', 'Stark',
  'Summit', 'Trumbull', 'Tuscarawas', 'Union', 'Van Wert', 'Vinton', 'Warren',
  'Washington', 'Wayne', 'Williams', 'Wood', 'Wyandot',
];

/** Escape a value for an ArcGIS SQL string literal. */
function sqlStr(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

function ohioStatewideSource(county: string): CountySource {
  const scope = `County = ${sqlStr(county)}`;
  return {
    id: `oh-${county.toLowerCase().replace(/\s+/g, '-')}-statewide`,
    state: 'OH',
    county,
    label: `${county} County, OH`,
    serviceUrl: OHIO_STATEWIDE_URL,
    fields: {
      parcelid: 'LocalParcelID',
      address: 'SitusAddressAll',
      landuse: 'StateLUC',
      mailing: ['MailAddressAll', 'MailCity', 'MailState', 'MailZip'],
    },
    where: {
      commercial: `${scope} AND ${OHIO_COMMERCIAL}`,
      residential: `${scope} AND ${OHIO_RESIDENTIAL}`,
    },
    coverage: { owner: false, bldgSqft: false, value: false, zip: false },
    note:
      'Ohio statewide layer: property addresses and land use only. Without owner names there is no portfolio grouping, and prices use estimator assumptions.',
  };
}

/** Counties with a better dedicated source than the statewide fallback. */
const DEDICATED: CountySource[] = [
  {
    id: 'oh-hamilton-cagis',
    state: 'OH',
    county: 'Hamilton',
    label: 'Hamilton County, OH (CAGIS)',
    serviceUrl:
      'https://services.arcgis.com/JyZag7oO4NteHGiq/arcgis/rest/services/Open_Data_Feature_Collection/FeatureServer/0',
    fields: {
      parcelid: 'PARCELID',
      // The situs address is split across number / street / suffix.
      address: ['ADDRNO', 'ADDRST', 'ADDRSF'],
      owner: 'OWNNM1',
      mailing: ['OWNAD1', 'OWNADCITY', 'OWNADSTATE', 'OWNADZIP'],
      landuse: 'CLASS',
      value: 'MKT_TOTAL_VAL',
    },
    // CLASS is numeric here; 300/400 are vacant land.
    where: {
      commercial: '(CLASS > 300 AND CLASS < 400) OR (CLASS > 400 AND CLASS < 500)',
      residential: 'CLASS > 500 AND CLASS < 600',
    },
    coverage: { owner: true, bldgSqft: false, value: true, zip: false },
    note:
      'Owner and market value included, but no building size — the prepared Hamilton CSV produces more precise pricing if you have it.',
  },
  {
    id: 'nc-wake',
    state: 'NC',
    county: 'Wake',
    label: 'Wake County, NC (Raleigh)',
    serviceUrl: 'https://maps.wake.gov/arcgis/rest/services/Property/Parcels/MapServer/0',
    fields: {
      parcelid: 'PIN_NUM',
      address: 'SITE_ADDRESS',
      city: 'CITY_DECODE',
      zip: 'ZIPNUM',
      owner: 'OWNER',
      mailing: ['ADDR1', 'ADDR2', 'ADDR3'],
      landuse: 'LAND_CLASS_DECODE',
      bldgsqft: 'HEATEDAREA',
      value: 'TOTAL_VALUE_ASSD',
      yearbuilt: 'YEAR_BUILT',
    },
    where: {
      commercial: `LAND_CLASS_DECODE IN ('Commercial','Industrial','Apartment','Condo Complex')`,
      residential: `LAND_CLASS_DECODE IN ('Residential Less Than 10 Acres','Acres Greater Than 10 With House','Condominium','Manufactured Home')`,
    },
    coverage: { owner: true, bldgSqft: true, value: true, zip: true },
  },
  {
    id: 'ca-sandiego-sandag',
    state: 'CA',
    county: 'San Diego',
    label: 'San Diego County, CA (SANDAG)',
    serviceUrl: 'https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0',
    fields: {
      parcelid: 'apn',
      // Situs address is split across number / direction / street / suffix / direction.
      address: ['situs_address', 'situs_pre_dir', 'situs_street', 'situs_suffix', 'situs_post_dir'],
      city: 'situs_community',
      zip: 'situs_zip',
      landuse: 'nucleus_use_cd',
      bldgsqft: 'total_lvg_area',
      value: 'asr_total',
      yearbuilt: 'year_effective',
    },
    // nucleus_use_cd has no published lookup table for this layer, so the
    // filter is derived from the live data itself: grouped stats show family
    // 1xx is overwhelmingly single-family-sized buildings and values (the
    // 110/111 codes alone cover 525k of San Diego's 855k residential-family
    // rows), while 2xx/3xx jump to commercial/industrial-scale buildings and
    // assessed values. Everything else (000 exempt, 5xx-6xx agricultural
    // acreage, 8xx-9xx near-zero-value parcels) is ambiguous and deliberately
    // excluded from both rather than guessed into the wrong one.
    where: {
      commercial: `nucleus_use_cd LIKE '2%' OR nucleus_use_cd LIKE '3%'`,
      residential: `nucleus_use_cd LIKE '1%'`,
    },
    // Unlike every other catalogued source, SANDAG's field names are all lowercase.
    objectIdField: 'objectid',
    coverage: { owner: false, bldgSqft: true, value: true, zip: true },
    note:
      "San Diego's open parcel layer has no owner name, so there's no portfolio grouping here — building size, value, and ZIP are all included.",
  },
];

/** Every source, dedicated ones first, then statewide fallbacks. */
export const COUNTY_SOURCES: CountySource[] = [
  ...DEDICATED,
  ...OHIO_COUNTIES.filter(
    (c) => !DEDICATED.some((d) => d.state === 'OH' && d.county === c),
  ).map(ohioStatewideSource),
];

export function findSource(id: string): CountySource | undefined {
  return COUNTY_SOURCES.find((s) => s.id === id);
}

/** Catalog for the picker: best-covered source first, then alphabetical. */
export function searchSources(query: string): CountySource[] {
  const q = query.trim().toLowerCase();
  const matches = q
    ? COUNTY_SOURCES.filter((s) =>
        `${s.county} ${s.state} ${s.label}`.toLowerCase().includes(q),
      )
    : COUNTY_SOURCES;
  return [...matches].sort(
    (a, b) =>
      coverageScore(b) - coverageScore(a) ||
      a.state.localeCompare(b.state) ||
      a.county.localeCompare(b.county),
  );
}
