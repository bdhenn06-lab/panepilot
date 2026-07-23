/**
 * CSV column auto-detection. Every county auditor exports different headers;
 * these patterns cover the common shapes (CAGIS, generic assessor exports).
 * First matching header wins, in file order.
 */
export const IMPORT_FIELDS = [
  ['address', 'Property address *'],
  ['owner', 'Owner name'],
  ['landuse', 'Land use / class'],
  ['bldgsqft', 'Building sq ft'],
  ['stories', 'Stories'],
  ['value', 'Market value'],
  ['mailing', 'Owner mailing'],
  ['zip', 'ZIP'],
  ['city', 'City'],
  ['lat', 'Latitude'],
  ['lon', 'Longitude'],
  ['parcelid', 'Parcel ID'],
  ['yearbuilt', 'Year built'],
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number][0];

const GUESS: Record<ImportField, RegExp[]> = {
  address: [/^(prop|site|situs|parcel)?_?(addr|address|location)/i, /^addr/i, /full_?addr/i, /prop.*addr/i],
  owner: [/owner.*name/i, /^owner1?$/i, /deeded/i, /taxpayer/i],
  mailing: [/mail/i],
  landuse: [/land_?use/i, /^luc/i, /^class/i, /use_?code/i, /dsc|descr/i],
  bldgsqft: [/bldg.*(sq|area)/i, /building.*(sq|area)/i, /total.*sq.?ft/i, /^sq_?ft/i, /fin.*area/i],
  stories: [/stor(y|ies)/i, /levels?/i, /floors?/i],
  value: [/market.*(total|value)|total.*(market|value)|appraised/i, /mkt.*(tot|val)/i, /total.*val/i, /^value$/i, /^(mkt|market)_?value$/i],
  parcelid: [/parcel.*(id|no|num)|^pin$|^parid/i],
  yearbuilt: [/year.*built|yr.*blt/i],
  city: [/city|municipal/i],
  zip: [/zip/i],
  lat: [/^lat|latitude/i],
  lon: [/^lon|^lng|longitude/i],
};

/** Map each import field to the best-guess CSV header ('' = not found). */
export function guessColumns(headers: string[]): Record<ImportField, string> {
  const out = {} as Record<ImportField, string>;
  (Object.keys(GUESS) as ImportField[]).forEach((field) => {
    out[field] = '';
    for (const h of headers) {
      if (GUESS[field].some((re) => re.test(h))) {
        out[field] = h;
        break;
      }
    }
  });
  return out;
}
