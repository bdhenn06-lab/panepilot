import type { ParcelInput, ScoringSettings } from './types';
import { fullAddress } from './outreach';

export type LatLon = [number, number];

/** Validate CSV/DB coordinates: plausible continental-US lat/lon or null. */
export function coordOf(p: { lat?: number | string | null; lon?: number | string | null }): LatLon | null {
  const lat = parseFloat(String(p.lat ?? ''));
  const lon = parseFloat(String(p.lon ?? ''));
  if (lat >= 24 && lat <= 50 && lon <= -60 && lon >= -125) return [lat, lon];
  return null;
}

/**
 * Nearest-neighbor ordering over stops that all have coordinates.
 * Starts from the first stop; each next stop is the closest remaining one
 * (squared-degree distance — fine at city scale). Fewer than 3 stops, or any
 * stop without coordinates, keeps the user's manual order.
 */
export function orderStops<T extends { coord: LatLon | null }>(stops: T[]): T[] {
  if (stops.length <= 2 || !stops.every((s) => s.coord)) return stops;
  const ordered = [stops[0]];
  const rest = stops.slice(1);
  while (rest.length) {
    const last = ordered[ordered.length - 1].coord!;
    let bestIdx = 0;
    let bestDist = Infinity;
    rest.forEach((s, i) => {
      const d = (s.coord![0] - last[0]) ** 2 + (s.coord![1] - last[1]) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    ordered.push(rest.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

const EARTH_RADIUS_MILES = 3958.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in miles. `orderStops` compares squared degrees, which
 * is fine for ordering a handful of stops but is not a distance — a degree of
 * longitude is much shorter than a degree of latitude at these latitudes, so
 * anything shown to the operator needs the real figure.
 */
export function milesBetween(a: LatLon, b: LatLon): number {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export interface NearbyCandidate {
  id: number;
  lat?: number | string | null;
  lon?: number | string | null;
  /** Annual value on the quarterly plan — decides the order within the radius. */
  annualValue: number;
}

/**
 * Prospects worth knocking on while the crew is already at `anchorId`.
 *
 * Deliberately a re-rank rather than a scoring factor. Weighting proximity
 * inside PaneScore would turn the list into "whatever is nearest" — a weak
 * building next door would outrank a strong one across town, which is the right
 * trade for a route dispatcher and the wrong one for deciding who to call.
 * Radius decides who is in scope; value decides the order inside it.
 */
export function nearbyTargets<T extends NearbyCandidate>(
  anchorId: number,
  territory: T[],
  radiusMiles: number,
): Array<T & { miles: number }> {
  const anchor = territory.find((x) => x.id === anchorId);
  const from = anchor ? coordOf(anchor) : null;
  if (!from) return [];

  return territory
    .flatMap((x) => {
      if (x.id === anchorId) return [];
      const to = coordOf(x);
      if (!to) return [];
      const miles = milesBetween(from, to);
      return miles <= radiusMiles ? [{ ...x, miles }] : [];
    })
    .sort((a, b) => b.annualValue - a.annualValue);
}

/** Google Maps directions URL: home base then each stop in order. */
export function googleMapsRouteUrl(stops: ParcelInput[], s: ScoringSettings): string {
  return (
    'https://www.google.com/maps/dir/' +
    encodeURIComponent(s.homeBase) +
    '/' +
    stops.map((p) => encodeURIComponent(fullAddress(p, s))).join('/')
  );
}

/** Google Maps satellite-search URL for one property. */
export function googleMapsSearchUrl(p: ParcelInput, s: ScoringSettings): string {
  return 'https://www.google.com/maps/search/' + encodeURIComponent(fullAddress(p, s));
}
