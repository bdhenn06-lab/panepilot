import { describe, expect, it } from 'vitest';
import { isMeaningfulState, remapPipeline, snapshotPipeline } from '../carryover';
import { EMPTY_STATE, type ProspectState } from '@/lib/scoring';
import type { ParcelRow } from '@/lib/db/types';

const parcel = (id: number, parcelNumber: string | null): ParcelRow => ({
  id,
  org_id: 'org-1',
  parcel_number: parcelNumber,
  address: `${id} Main St`,
  city: null,
  zip: null,
  owner_name: null,
  owner_key: null,
  owner_mailing: null,
  land_use: null,
  bldg_sqft: null,
  stories: null,
  market_value: null,
  year_built: null,
  lat: null,
  lon: null,
});

const st = (over: Partial<ProspectState>): ProspectState => ({ ...EMPTY_STATE, ...over });

describe('isMeaningfulState', () => {
  it('keeps states with any status, touch, notes, or due date', () => {
    expect(isMeaningfulState(st({ status: 'Won' }))).toBe(true);
    expect(isMeaningfulState(st({ touch: 1 }))).toBe(true);
    expect(isMeaningfulState(st({ notes: 'gatekeeper is Carol' }))).toBe(true);
    expect(isMeaningfulState(st({ due: '2026-08-01' }))).toBe(true);
  });
  it('drops empty states and undefined', () => {
    expect(isMeaningfulState(st({}))).toBe(false);
    expect(isMeaningfulState(undefined)).toBe(false);
  });
});

describe('snapshotPipeline -> remapPipeline round trip', () => {
  const parcels = [parcel(1, 'PN-A'), parcel(2, 'PN-B'), parcel(3, null), parcel(4, 'PN-D')];
  const states = {
    1: st({ status: 'Sequencing', touch: 2, due: '2026-08-01', notes: 'call after 2pm' }),
    2: st({}), // empty — should not survive
    3: st({ status: 'Won' }), // no parcel number — cannot be matched
    4: st({ status: 'Meeting', touch: 3 }),
  };
  const route = [4, 1, 3]; // includes an unmatchable stop

  it('snapshots only meaningful, matchable states plus the route order', () => {
    const snap = snapshotPipeline(parcels, states, route);
    expect([...snap.states.keys()].sort()).toEqual(['PN-A', 'PN-D']);
    expect(snap.states.get('PN-A')!.notes).toBe('call after 2pm');
    expect(snap.routeParcelNumbers).toEqual(['PN-D', 'PN-A']);
  });

  it('remaps onto new ids, dropping parcels missing from the new export', () => {
    const snap = snapshotPipeline(parcels, states, route);
    // New import: PN-A got id 101; PN-D vanished from the county file.
    const newIds = new Map([
      ['PN-A', 101],
      ['PN-B', 102],
      ['PN-Z', 199],
    ]);
    const remapped = remapPipeline(snap, newIds);
    expect(remapped.states).toEqual([
      { parcelId: 101, state: states[1] },
    ]);
    expect(remapped.routeIds).toEqual([101]);
  });

  it('full survival when every parcel number reappears', () => {
    const snap = snapshotPipeline(parcels, states, route);
    const newIds = new Map([
      ['PN-A', 201],
      ['PN-D', 204],
    ]);
    const remapped = remapPipeline(snap, newIds);
    expect(remapped.states.map((x) => x.parcelId).sort()).toEqual([201, 204]);
    expect(remapped.routeIds).toEqual([204, 201]); // route order preserved
  });

  it('first state wins on duplicate parcel numbers', () => {
    const dupes = [parcel(1, 'PN-X'), parcel(2, 'PN-X')];
    const snap = snapshotPipeline(
      dupes,
      { 1: st({ status: 'Won' }), 2: st({ status: 'Dead' }) },
      [],
    );
    expect(snap.states.get('PN-X')!.status).toBe('Won');
  });

  it('deduplicates route ids after remap', () => {
    const twoStops = [parcel(1, 'PN-A'), parcel(2, 'PN-B')];
    const snap = snapshotPipeline(twoStops, {}, [1, 2]);
    // Both old parcels collapse onto one new row (county merged them).
    const remapped = remapPipeline(snap, new Map([['PN-A', 301], ['PN-B', 301]]));
    expect(remapped.routeIds).toEqual([301]);
  });
});
