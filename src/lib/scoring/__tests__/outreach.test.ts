import { describe, expect, it } from 'vitest';
import { fullAddress } from '../outreach';
import { DEFAULT_SETTINGS } from '../settings';
import type { ScoringSettings } from '../types';

const withState = (regionState: string): ScoringSettings => ({ ...DEFAULT_SETTINGS, regionState });

describe('fullAddress', () => {
  it('composes street, city, state, and ZIP', () => {
    expect(
      fullAddress({ address: '100 Main St', city: 'Cincinnati', zip: '45202' }, withState('OH')),
    ).toBe('100 Main St, Cincinnati, OH 45202');
  });

  it('uses whatever state the workspace is configured for', () => {
    expect(
      fullAddress({ address: '1200 17th St', city: 'Denver', zip: '80202' }, withState('CO')),
    ).toBe('1200 17th St, Denver, CO 80202');
  });

  it('omits an unset state instead of emitting a stray comma', () => {
    // A brand-new workspace has no region state until import detects it; the
    // address still has to be usable in a proposal or Google Maps link.
    expect(
      fullAddress({ address: '100 Main St', city: 'Cincinnati', zip: '45202' }, withState('')),
    ).toBe('100 Main St, Cincinnati, 45202');
  });

  it('handles missing city and ZIP', () => {
    expect(fullAddress({ address: '100 Main St' }, withState('OH'))).toBe('100 Main St, OH');
    expect(fullAddress({ address: '100 Main St', city: 'Mason' }, withState(''))).toBe(
      '100 Main St, Mason',
    );
  });

  it('truncates ZIP+4 to five digits', () => {
    expect(
      fullAddress({ address: '1 A St', city: 'Cincinnati', zip: '452301403' }, withState('OH')),
    ).toBe('1 A St, Cincinnati, OH 45230');
  });
});
