import type { ProspectState } from '@/lib/scoring';
import type { ParcelRow } from '@/lib/db/types';

/**
 * Pipeline carryover for dataset re-imports.
 *
 * Replacing a territory (fresher county export, new columns mapped) used to
 * wipe every status, note, and route. These helpers snapshot the pipeline
 * keyed by county parcel number before the wipe and remap it onto the newly
 * imported rows, so months of team work survive a data refresh.
 */

export interface PipelineSnapshot {
  /** Meaningful prospect states keyed by parcel_number. */
  states: Map<string, ProspectState>;
  /** Route stops as parcel_numbers, in order. */
  routeParcelNumbers: string[];
}

/** Does this state carry anything worth preserving? */
export function isMeaningfulState(s: ProspectState | undefined): s is ProspectState {
  return !!s && (s.status !== '' || s.touch > 0 || s.notes !== '' || s.due !== '');
}

/**
 * Capture the current pipeline keyed by parcel number. Parcels without a
 * parcel number can't be matched across imports and are skipped; on
 * duplicate parcel numbers the first (highest-scored ordering upstream is
 * irrelevant here — first encountered) wins.
 */
export function snapshotPipeline(
  parcels: ParcelRow[],
  states: Record<number, ProspectState>,
  route: number[],
): PipelineSnapshot {
  const byId = new Map(parcels.map((p) => [p.id, p]));
  const stateMap = new Map<string, ProspectState>();
  for (const p of parcels) {
    const pn = p.parcel_number?.trim();
    if (!pn || stateMap.has(pn)) continue;
    const s = states[p.id];
    if (isMeaningfulState(s)) stateMap.set(pn, s);
  }
  const routeParcelNumbers: string[] = [];
  for (const id of route) {
    const pn = byId.get(id)?.parcel_number?.trim();
    if (pn) routeParcelNumbers.push(pn);
  }
  return { states: stateMap, routeParcelNumbers };
}

export interface RemappedPipeline {
  states: Array<{ parcelId: number; state: ProspectState }>;
  routeIds: number[];
}

/**
 * Reattach a snapshot to freshly imported rows via parcel number. Parcels
 * that disappeared from the new export are dropped (their pipeline state
 * has nothing to attach to).
 */
export function remapPipeline(
  snapshot: PipelineSnapshot,
  newIdByParcelNumber: Map<string, number>,
): RemappedPipeline {
  const states: RemappedPipeline['states'] = [];
  for (const [pn, state] of snapshot.states) {
    const id = newIdByParcelNumber.get(pn);
    if (id != null) states.push({ parcelId: id, state });
  }
  const routeIds: number[] = [];
  for (const pn of snapshot.routeParcelNumbers) {
    const id = newIdByParcelNumber.get(pn);
    if (id != null && !routeIds.includes(id)) routeIds.push(id);
  }
  return { states, routeIds };
}
