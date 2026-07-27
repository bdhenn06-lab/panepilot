import { describe, expect, it } from 'vitest';
import { detectLocality, stateFromZip } from '../locality';
import type { ParcelInput } from '../types';

const p = (zip: string, city: string): ParcelInput => ({ address: '1 Main St', zip, city });

describe('stateFromZip', () => {
  it('maps real ZIPs to their states', () => {
    expect(stateFromZip('45202')).toBe('OH'); // Cincinnati
    expect(stateFromZip('80202')).toBe('CO'); // Denver
    expect(stateFromZip('78701')).toBe('TX'); // Austin
    expect(stateFromZip('90210')).toBe('CA'); // Beverly Hills
    expect(stateFromZip('10001')).toBe('NY'); // Manhattan
    expect(stateFromZip('98101')).toBe('WA'); // Seattle
    expect(stateFromZip('33101')).toBe('FL'); // Miami
    expect(stateFromZip('02108')).toBe('MA'); // Boston
    expect(stateFromZip('99501')).toBe('AK'); // Anchorage
  });

  it('handles ZIP+4 and stray formatting', () => {
    expect(stateFromZip('45202-1403')).toBe('OH');
    expect(stateFromZip(' 45202 ')).toBe('OH');
    expect(stateFromZip(45202)).toBe('OH');
  });

  it('returns empty for unusable input', () => {
    expect(stateFromZip('')).toBe('');
    expect(stateFromZip(null)).toBe('');
    expect(stateFromZip('123')).toBe(''); // too short
    expect(stateFromZip('N/A')).toBe('');
    expect(stateFromZip('42999')).toBe(''); // unallocated prefix
  });
});

describe('detectLocality', () => {
  it('derives state, city, and ZIP prefix from a Cincinnati territory', () => {
    const parcels = [
      p('45202', 'Cincinnati'),
      p('45202', 'Cincinnati'),
      p('45208', 'Cincinnati'),
      p('45242', 'Blue Ash'),
    ];
    expect(detectLocality(parcels)).toEqual({
      regionState: 'OH',
      localState: 'OH',
      localCity: 'Cincinnati',
      localZipPrefix: '45',
    });
  });

  it('works just as well for a Denver territory (no Ohio assumptions)', () => {
    const parcels = [
      p('80202', 'Denver'),
      p('80203', 'Denver'),
      p('80301', 'Boulder'),
    ];
    expect(detectLocality(parcels)).toEqual({
      regionState: 'CO',
      localState: 'CO',
      localCity: 'Denver',
      localZipPrefix: '80',
    });
  });

  it('ignores a few out-of-state rows when picking city and prefix', () => {
    const parcels = [
      ...Array.from({ length: 8 }, () => p('78701', 'Austin')),
      p('10001', 'New York'), // absentee outlier
    ];
    const got = detectLocality(parcels)!;
    expect(got.regionState).toBe('TX');
    expect(got.localCity).toBe('Austin');
    expect(got.localZipPrefix).toBe('78');
  });

  it('returns null when there are no usable ZIPs, so settings stay untouched', () => {
    expect(detectLocality([])).toBeNull();
    expect(detectLocality([{ address: 'x' }, { address: 'y', zip: '' }])).toBeNull();
    expect(detectLocality([{ address: 'x', zip: 'N/A' }])).toBeNull();
  });

  it('still detects the state when city data is missing entirely', () => {
    const got = detectLocality([{ address: 'x', zip: '85001' }, { address: 'y', zip: '85002' }])!;
    expect(got.regionState).toBe('AZ');
    expect(got.localCity).toBe('');
    expect(got.localZipPrefix).toBe('85');
  });
});
