import { describe, expect, it } from 'vitest';
import { milesBetween, nearbyTargets, type NearbyCandidate } from '../route';

const CINCY: [number, number] = [39.1031, -84.512];
const DAYTON: [number, number] = [39.7589, -84.1916];

const p = (id: number, lat: number | null, lon: number | null, annualValue = 1000): NearbyCandidate => ({
  id,
  lat,
  lon,
  annualValue,
});

describe('milesBetween', () => {
  it('matches the real Cincinnati-to-Dayton distance', () => {
    // ~48 miles as the crow flies.
    expect(milesBetween(CINCY, DAYTON)).toBeGreaterThan(44);
    expect(milesBetween(CINCY, DAYTON)).toBeLessThan(52);
  });

  it('is zero for the same point and symmetric', () => {
    expect(milesBetween(CINCY, CINCY)).toBeCloseTo(0, 6);
    expect(milesBetween(CINCY, DAYTON)).toBeCloseTo(milesBetween(DAYTON, CINCY), 6);
  });
});

/**
 * "I'm already on Commerce Drive Tuesday — what else is worth knocking on while
 * I'm there?" Distance decides who is in scope; value decides the order, since
 * the nearest building is not automatically the one worth the stop.
 */
describe('nearbyTargets', () => {
  const territory = [
    p(1, 39.1031, -84.512, 5000), // anchor
    p(2, 39.1035, -84.5125, 2000), // ~0.03 mi
    p(3, 39.1101, -84.52, 9000), // ~0.7 mi
    p(4, 39.7589, -84.1916, 50000), // Dayton — far, high value
    p(5, null, null, 8000), // no coordinates
  ];

  it('excludes the anchor itself', () => {
    expect(nearbyTargets(1, territory, 5).map((x) => x.id)).not.toContain(1);
  });

  it('keeps only what is inside the radius', () => {
    const ids = nearbyTargets(1, territory, 5).map((x) => x.id);
    expect(ids).toContain(2);
    expect(ids).toContain(3);
    expect(ids).not.toContain(4); // Dayton is ~48 miles out
  });

  it('drops parcels with no usable coordinates instead of guessing', () => {
    expect(nearbyTargets(1, territory, 5).map((x) => x.id)).not.toContain(5);
  });

  it('orders by value, not by proximity — the nearest is not always worth the stop', () => {
    const out = nearbyTargets(1, territory, 5);
    expect(out[0].id).toBe(3); // $9k at 0.7mi beats $2k next door
    expect(out.map((x) => x.annualValue)).toEqual([...out.map((x) => x.annualValue)].sort((a, b) => b - a));
  });

  it('reports the distance so the operator can judge the detour', () => {
    const near = nearbyTargets(1, territory, 5).find((x) => x.id === 2)!;
    expect(near.miles).toBeGreaterThan(0);
    expect(near.miles).toBeLessThan(0.5);
  });

  it('returns nothing when the anchor has no coordinates', () => {
    expect(nearbyTargets(5, territory, 5)).toEqual([]);
  });

  it('returns nothing for an unknown anchor', () => {
    expect(nearbyTargets(999, territory, 5)).toEqual([]);
  });
});
