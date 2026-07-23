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
