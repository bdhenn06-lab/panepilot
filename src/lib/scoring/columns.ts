/**
 * CSV column auto-detection.
 *
 * Every county publishes parcel data with different headers, and the common
 * assessor platforms each have their own conventions (Tyler/iasWorld's terse
 * `PARID`/`OWN1`/`SFLA`, ESRI parcel layers' `SITE_ADDR`/`OWNER_NAME`,
 * Florida's NAL `PHY_ADDR1`/`TOT_LVG_AREA`/`JV`, Texas CAD's `situs_*`).
 *
 * Two rules make this reliable across them:
 *
 *  1. Patterns are ranked by confidence and tried in order across ALL headers,
 *     rather than taking whichever column happens to match first in file order.
 *     Otherwise a file listing `OWNER_CITY` before `SITUS_CITY` would map the
 *     owner's mailing city as the property city.
 *  2. Each field can exclude headers outright. The property address, city, and
 *     ZIP must never come from a mailing/owner column, and building area must
 *     never come from a land/lot area column.
 *
 * Anything the guesser misses is still selectable by hand in the import UI, so
 * a miss costs a dropdown, never a failed import.
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

interface FieldRule {
  /** Tried in order; the first pattern with any matching header wins. */
  prefer: RegExp[];
  /** Headers matching this are never used for this field. */
  avoid?: RegExp;
}

/** Property-location prefixes used by the major assessor exports. */
const SITUS = '(situs|site|prop|property|phy|physical|location|loc)';

const RULES: Record<ImportField, FieldRule> = {
  address: {
    avoid: /mail|owner|^own[_\d]|legal/i,
    prefer: [
      new RegExp(`${SITUS}_?.*addr`, 'i'),
      /full_?addr/i,
      /street_?add?r/i,
      /^addr/i,
      /addr/i,
      /^location$/i,
    ],
  },
  owner: {
    avoid: /addr|city|state|zip|mail|phone/i,
    prefer: [
      /own.*name/i,
      /^own\d*$/i,
      /^owner/i,
      // Must mention an owner: a bare /deed/ matches DEED_BOOK / DEED_PAGE,
      // which are recording references, not names (seen in Wake County, NC).
      /deed(ed)?_?own|grantee|taxpayer/i,
      /name1/i,
    ],
  },
  mailing: {
    // Several exports (Florida's NAL, most CAMA dumps) call the mailing
    // address the "owner address" and have no column named `mail`.
    prefer: [/mail.*addr/i, /^mail/i, /mail/i, /own.*addr/i],
  },
  landuse: {
    avoid: /zoning/i,
    prefer: [
      /land_?use/i,
      // Where a coded column and its readable twin both exist, take the twin:
      // "Commercial" classifies better than "43". Land-specific first, so a
      // generic *_DECODE (Wake's BILLING_CLASS_DECODE) can't win.
      /land_?class_?(code|desc|decode)/i,
      /land_?class/i,
      /(dor|state|prop|property)_?_?(uc|use|class)/i,
      /(use|class)_?(code|desc|decode)/i,
      /use_?(code|desc|cd)/i,
      // Ohio's statewide layer names it StateLUC.
      /(^|_)luc(_|$)|stateluc/i,
      /^luc/i,
      /class.*desc/i,
      /prop.*class/i,
      /^class/i,
      /descr/i,
      // Texas CADs classify land use in `state_cd`. Last resort: if this ever
      // grabs a literal state-abbreviation column the commercial filter matches
      // nothing, which surfaces as a clear "check the column mapping" error.
      /^state_?cd$/i,
    ],
  },
  bldgsqft: {
    // Land/lot area is a different (and much larger) number — never use it.
    avoid: /land|lot|acre|deck|porch|garage|basement|attic/i,
    prefer: [
      /(bldg|building|structure|improve).*(sq|area)/i,
      /(tot|total).*(lvg|liv|living|heated|finish).*area/i,
      /(lvg|liv|living|heated|finished|gross).*(area|sq)/i,
      /^sfla$/i,
      /total.*sq.?ft/i,
      /^sq_?ft/i,
      /sq.?ft/i,
      /fin.*area/i,
    ],
  },
  stories: {
    avoid: /basement|story_?desc/i,
    prefer: [/stor(y|ies)/i, /num.*floor/i, /^floors?$/i, /levels?/i, /floors?/i],
  },
  value: {
    // Land-only, exempt, and prior-year columns are not the market value.
    avoid: /land|lot|exempt|prior|prev|last|deduct|taxable_?land/i,
    prefer: [
      /(mkt|market).*(tot|total|val)/i,
      /(tot|total).*(mkt|market).*val/i,
      /appraised/i,
      /just.*val/i,
      /^jv$/i,
      /assess.*(val|tot)/i,
      /^(tot|total)_?_?val/i,
      /total.*val/i,
      /^(mkt|market)_?value$/i,
      /^value$/i,
      /value/i,
    ],
  },
  parcelid: {
    // Internal surrogate keys aren't stable public parcel numbers, and
    // carryover across re-imports matches on this value.
    avoid: /_pk$|^fid$|^objectid|globalid/i,
    prefer: [
      /parcel.*(id|no|num)/i,
      /^pin(_?num)?$/i,
      /^par(id|cel)/i,
      /^pin$/i,
      /^apn$/i,
      /account.*(no|num)/i,
      /^prop(erty)?_?id$/i,
      /^gpin$/i,
    ],
  },
  yearbuilt: {
    avoid: /remodel|sold|sale|reno/i,
    prefer: [/year.*built/i, /yr.*blt/i, /(act|eff).*yr/i, /yr.*built/i, /built/i],
  },
  // Any header starting with "own" describes the owner, not the property —
  // CAGIS uses OWNADCITY / OWNADZIP for the owner's mailing address.
  city: {
    avoid: /mail|^own|owner|tax/i,
    prefer: [new RegExp(`${SITUS}_?.*city`, 'i'), /^city$/i, /city/i, /municipal/i],
  },
  zip: {
    avoid: /mail|^own|owner|tax/i,
    prefer: [new RegExp(`${SITUS}_?.*zip`, 'i'), /^zip/i, /zip/i, /postal/i],
  },
  lat: {
    prefer: [/^lat$/i, /latitude/i, /^lat[_\W]/i, /lat/i],
  },
  lon: {
    prefer: [/^lon$/i, /^lng$/i, /^long$/i, /longitude/i, /^lon[_\W]/i, /lon|lng/i],
  },
};

/** Map each import field to the best-guess CSV header ('' = not found). */
export function guessColumns(headers: string[]): Record<ImportField, string> {
  const out = {} as Record<ImportField, string>;
  for (const field of Object.keys(RULES) as ImportField[]) {
    const { prefer, avoid } = RULES[field];
    const eligible = avoid ? headers.filter((h) => !avoid.test(h)) : headers;
    out[field] = '';
    for (const pattern of prefer) {
      const hit = eligible.find((h) => pattern.test(h));
      if (hit) {
        out[field] = hit;
        break;
      }
    }
  }
  return out;
}
