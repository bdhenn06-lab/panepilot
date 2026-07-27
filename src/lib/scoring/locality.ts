import type { ParcelInput } from './types';

/**
 * Locality auto-detection.
 *
 * The scoring engine and outreach copy need to know what market a territory is
 * in: the state to append to property addresses, and the city/state/ZIP markers
 * that decide whether an owner's mailing address is "local" (a buyer signal).
 *
 * Rather than making every new workspace configure this by hand — and silently
 * scoring against the wrong market until they notice — we derive it from the
 * parcels they just imported. State comes from the ZIP code via the USPS
 * prefix ranges, which is deterministic and works in every US county.
 */

/**
 * First-3-digit ZIP prefix ranges by state (USPS SCF allocation).
 * Ranges are inclusive. Unallocated prefixes fall through to ''.
 */
const ZIP_RANGES: Array<[number, number, string]> = [
  [6, 9, 'PR'], [10, 27, 'MA'], [28, 29, 'RI'], [30, 38, 'NH'], [39, 49, 'ME'],
  [50, 59, 'VT'], [60, 69, 'CT'], [70, 89, 'NJ'], [100, 149, 'NY'], [150, 196, 'PA'],
  [197, 199, 'DE'], [200, 205, 'DC'], [206, 219, 'MD'], [220, 246, 'VA'], [247, 268, 'WV'],
  [270, 289, 'NC'], [290, 299, 'SC'], [300, 319, 'GA'], [320, 349, 'FL'], [350, 369, 'AL'],
  [370, 385, 'TN'], [386, 397, 'MS'], [398, 399, 'GA'], [400, 427, 'KY'], [430, 459, 'OH'],
  [460, 479, 'IN'], [480, 499, 'MI'], [500, 528, 'IA'], [530, 549, 'WI'], [550, 567, 'MN'],
  [570, 577, 'SD'], [580, 588, 'ND'], [590, 599, 'MT'], [600, 629, 'IL'], [630, 658, 'MO'],
  [660, 679, 'KS'], [680, 693, 'NE'], [700, 714, 'LA'], [716, 729, 'AR'], [730, 749, 'OK'],
  [750, 799, 'TX'], [800, 816, 'CO'], [820, 831, 'WY'], [832, 838, 'ID'], [840, 847, 'UT'],
  [850, 865, 'AZ'], [870, 884, 'NM'], [889, 898, 'NV'], [900, 961, 'CA'], [967, 968, 'HI'],
  [970, 979, 'OR'], [980, 994, 'WA'], [995, 999, 'AK'],
];

/** USPS state for a ZIP code, or '' when it isn't a recognizable US ZIP. */
export function stateFromZip(zip: unknown): string {
  const digits = String(zip ?? '').replace(/\D/g, '');
  if (digits.length < 5) return '';
  const prefix = parseInt(digits.slice(0, 3), 10);
  if (Number.isNaN(prefix)) return '';
  for (const [lo, hi, state] of ZIP_RANGES) {
    if (prefix >= lo && prefix <= hi) return state;
  }
  return '';
}

export interface DetectedLocality {
  /** State appended to property addresses (proposals, Google Maps links). */
  regionState: string;
  /** Markers that make an owner's mailing address count as local. */
  localState: string;
  localCity: string;
  localZipPrefix: string;
}

/** Most frequent non-empty value in a list, or '' if there are none. */
function mode(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) {
    const k = v.trim();
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = '';
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

/**
 * Derive the market from a batch of parcels: the dominant state (via ZIP),
 * the dominant city, and the shared 2-digit ZIP prefix. Returns null when the
 * data has no usable ZIPs, so callers can leave existing settings untouched.
 */
export function detectLocality(parcels: ParcelInput[]): DetectedLocality | null {
  const zips = parcels
    .map((p) => String(p.zip ?? '').replace(/\D/g, '').slice(0, 5))
    .filter((z) => z.length === 5);
  if (!zips.length) return null;

  const state = mode(zips.map(stateFromZip));
  if (!state) return null;

  // Only consider parcels actually in the dominant state, so a handful of
  // out-of-state rows can't skew the city or ZIP prefix.
  const inState = parcels.filter((p) => stateFromZip(p.zip) === state);
  const city = mode(inState.map((p) => String(p.city ?? '')));
  const zipPrefix = mode(
    inState
      .map((p) => String(p.zip ?? '').replace(/\D/g, '').slice(0, 2))
      .filter((z) => z.length === 2),
  );

  return {
    regionState: state,
    localState: state,
    localCity: city,
    localZipPrefix: zipPrefix,
  };
}
