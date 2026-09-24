/**
 * Deterministic sample territory for component tests — mirrors the
 * prototype's sample-data generator (Cincinnati metro, fictional parcels).
 */
import type { ParcelRow } from '@/lib/db/types';
import type { ScoredParcel } from '@/components/workspace';
import { DEMO_SETTINGS, sampleParcels as generateSampleParcels } from '@/lib/sample-territory';
import { buildContext, estimate, jobThesis, paneScore } from '@/lib/scoring';
import { parcelToInput } from '@/lib/db/mappers';

export function sampleParcels(): ParcelRow[] {
  return generateSampleParcels('org-1');
}

export function scoreFixture(rows: ParcelRow[]): ScoredParcel[] {
  const inputs = rows.map(parcelToInput);
  const ctx = buildContext(inputs);
  const list = rows.map((row, i) => {
    const est = estimate(inputs[i], DEMO_SETTINGS);
    return {
      id: row.id,
      row,
      input: inputs[i],
      est,
      score: paneScore(inputs[i], est, ctx, DEMO_SETTINGS),
      thesis: jobThesis(inputs[i], est, ctx, DEMO_SETTINGS),
    };
  });
  list.sort(
    (a, b) => b.score.total - a.score.total || b.est.annualQuarterly - a.est.annualQuarterly,
  );
  return list;
}
