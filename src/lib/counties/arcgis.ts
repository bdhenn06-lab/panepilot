import { parseNum } from '@/lib/scoring';
import type { CountyFieldMap, CountySource, FieldRef, NormalizedParcel } from './types';

/**
 * Pure helpers for reading county parcel data out of ArcGIS REST services.
 *
 * No I/O here — the API route does the fetching so this stays unit-testable
 * against the real schemas these services return.
 */

/** ArcGIS caps most services at 2000 records per request. */
export const PAGE_SIZE = 2000;

export type ServiceMode = 'commercial' | 'residential';

/** Flatten a field reference into the attribute names it needs. */
export function refToNames(ref: FieldRef | undefined): string[] {
  if (!ref) return [];
  return Array.isArray(ref) ? ref : [ref];
}

/** Every attribute the mapping needs, deduped — keeps responses small. */
export function outFieldsFor(fields: CountyFieldMap): string[] {
  const names = new Set<string>();
  for (const ref of Object.values(fields)) {
    for (const n of refToNames(ref as FieldRef)) names.add(n);
  }
  return [...names];
}

/**
 * Read one logical field. Multi-part refs (house number / street / suffix) are
 * joined with single spaces; ArcGIS pads these values, so collapse whitespace.
 */
export function composeField(
  attrs: Record<string, unknown>,
  ref: FieldRef | undefined,
): string {
  if (!ref) return '';
  const parts = refToNames(ref)
    .map((n) => {
      const v = attrs[n];
      return v == null ? '' : String(v).trim();
    })
    .filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Build the query URL for one page (or a count-only probe). */
export function buildQueryUrl(
  source: CountySource,
  opts: { mode: ServiceMode; offset?: number; limit?: number; countOnly?: boolean },
): string {
  const params = new URLSearchParams({
    where: source.where[opts.mode] || '1=1',
    f: 'json',
    returnGeometry: 'false',
  });
  if (opts.countOnly) {
    params.set('returnCountOnly', 'true');
  } else {
    params.set('outFields', outFieldsFor(source.fields).join(','));
    params.set('resultOffset', String(opts.offset ?? 0));
    params.set('resultRecordCount', String(opts.limit ?? PAGE_SIZE));
    // Stable paging: without an order the service may repeat or skip rows.
    params.set('orderByFields', source.objectIdField || 'OBJECTID');
    // A parcel's own centroid beats mailing-address geocoding: it needs no
    // city/ZIP to disambiguate (several sources, e.g. Hamilton's CAGIS layer,
    // publish neither) and it's exact rather than street-interpolated. Older
    // MapServer endpoints (e.g. Wake County) silently ignore this and omit
    // `centroid` from the response — those rows fall back to the Census
    // geocode button, which works fine there since it has city and ZIP.
    params.set('returnCentroid', 'true');
    params.set('outSR', '4326');
  }
  return `${source.serviceUrl.replace(/\/$/, '')}/query?${params.toString()}`;
}

/** Numeric attribute, or null when absent/unparseable. */
function numOrNull(attrs: Record<string, unknown>, ref: FieldRef | undefined): number | null {
  if (!ref) return null;
  const raw = composeField(attrs, ref);
  if (!raw) return null;
  const n = parseNum(raw);
  return n || null;
}

/**
 * Turn one ArcGIS feature's attributes into a parcel row. Returns null when
 * there's no usable street address, since everything downstream (outreach,
 * proposals, geocoding, routes) is keyed off it.
 *
 * `centroid` is the feature's own `{x: lon, y: lat}`, requested alongside the
 * attributes (see `buildQueryUrl`) — present on most services, absent on a
 * few older ones, in which case the row falls back to street geocoding.
 */
export function normalizeFeature(
  attrs: Record<string, unknown>,
  source: CountySource,
  centroid?: { x: number; y: number } | null,
): NormalizedParcel | null {
  const f = source.fields;
  const address = composeField(attrs, f.address);
  if (!address) return null;

  const zipRaw = composeField(attrs, f.zip);
  const year = numOrNull(attrs, f.yearbuilt);
  const lat = centroid && Number.isFinite(centroid.y) ? centroid.y : null;
  const lon = centroid && Number.isFinite(centroid.x) ? centroid.x : null;

  return {
    parcel_number: composeField(attrs, f.parcelid) || null,
    address,
    city: composeField(attrs, f.city) || null,
    zip: zipRaw ? zipRaw.replace(/\D/g, '').slice(0, 5) || null : null,
    owner_name: composeField(attrs, f.owner) || null,
    owner_mailing: composeField(attrs, f.mailing) || null,
    land_use: composeField(attrs, f.landuse) || null,
    bldg_sqft: numOrNull(attrs, f.bldgsqft),
    stories: numOrNull(attrs, f.stories),
    market_value: numOrNull(attrs, f.value),
    year_built: year ? Math.round(year) : null,
    lat,
    lon,
  };
}

/** One-line description of what a source will and won't give you. */
export function coverageSummary(source: CountySource): string {
  const has: string[] = [];
  const missing: string[] = [];
  (
    [
      ['owner', 'owner names'],
      ['bldgSqft', 'building size'],
      ['value', 'market value'],
      ['zip', 'ZIP codes'],
    ] as const
  ).forEach(([key, label]) => (source.coverage[key] ? has : missing).push(label));
  const parts: string[] = [];
  if (has.length) parts.push(`Includes ${has.join(', ')}`);
  if (missing.length) parts.push(`no ${missing.join(', ')}`);
  return parts.join(' · ');
}

/** Rough quality tier, used to order the picker and pick a default source. */
export function coverageScore(source: CountySource): number {
  const c = source.coverage;
  return (c.owner ? 4 : 0) + (c.bldgSqft ? 3 : 0) + (c.value ? 2 : 0) + (c.zip ? 1 : 0);
}
