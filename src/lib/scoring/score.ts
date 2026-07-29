import { parseNum, classifyUse } from './classify';
import { ownerKey } from './owner';
import { formatMoney } from './format';
import type {
  Estimate,
  Grade,
  ParcelInput,
  ScoreBreakdown,
  ScoringSettings,
  TerritoryContext,
} from './types';

export function gradeOf(total: number): Grade {
  return total >= 70 ? 'A' : total >= 55 ? 'B' : total >= 40 ? 'C' : 'D';
}

/**
 * Median of a pre-sorted list. Averaging the middle pair on even lengths
 * matters: taking the upper element biases the threshold up, so fewer
 * buildings ever clear the "above-median $/sqft" buyer signal.
 */
function median(sorted: number[]): number {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Compute territory-wide aggregates needed to score individual parcels. */
export function buildContext(parcels: ParcelInput[]): TerritoryContext {
  const zipCounts: Record<string, number> = {};
  const ownerCounts: Record<string, number> = {};
  const valuesPerSqft: number[] = [];
  for (const p of parcels) {
    const zip = String(p.zip ?? '').slice(0, 5);
    if (zip) zipCounts[zip] = (zipCounts[zip] || 0) + 1;
    const key = ownerKey(p.ownerName);
    if (key) ownerCounts[key] = (ownerCounts[key] || 0) + 1;
    const mv = parseNum(p.marketValue);
    const sqft = parseNum(p.bldgSqft);
    if (mv > 0 && sqft > 0) valuesPerSqft.push(mv / sqft);
  }
  valuesPerSqft.sort((a, b) => a - b);
  let zipMax = 1;
  for (const z of Object.keys(zipCounts)) if (zipCounts[z] > zipMax) zipMax = zipCounts[z];
  return {
    zipCounts,
    zipMax,
    ownerCounts,
    medianValuePerSqft: median(valuesPerSqft),
  };
}

/** Does the owner's mailing address look local to the service territory? */
export function isLocalMailing(mailing: string, s: ScoringSettings): boolean {
  if (!mailing) return false;
  const checks: RegExp[] = [];
  if (s.localState) checks.push(new RegExp(`\\b${escapeRe(s.localState)}\\b`, 'i'));
  if (s.localCity) checks.push(new RegExp(escapeRe(s.localCity), 'i'));
  if (s.localZipPrefix) checks.push(new RegExp(`\\b${escapeRe(s.localZipPrefix)}\\d{${Math.max(0, 5 - s.localZipPrefix.length)}}\\b`));
  return checks.some((re) => re.test(mailing));
}

function escapeRe(x: string): string {
  return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * PaneScore: 0-100 prospect ranking with a transparent per-factor breakdown.
 * Five weighted factors — contract value (log-scaled), building fit,
 * buyer signal, portfolio owner bonus, and ZIP route density.
 */
export function paneScore(
  parcel: ParcelInput,
  est: Estimate,
  ctx: TerritoryContext,
  s: ScoringSettings,
): ScoreBreakdown {
  const parts: ScoreBreakdown['parts'] = [];
  let total = 0;
  const add = (label: string, points: number, max: number, why: string) => {
    parts.push({ label, points: Math.round(points * 10) / 10, max, why });
    total += points;
  };

  // 1. Contract value, log-scaled between the floor and ceiling anchors.
  // Anchors are org-configurable — commercial contracts and residential
  // cleans differ by an order of magnitude, so they need different scales.
  const valueFrac = Math.max(
    0,
    Math.min(1, Math.log((est.annualQuarterly || 1) / s.valueFloor) / Math.log(s.valueCeil / s.valueFloor)),
  );
  add(
    'Contract value',
    valueFrac * s.weightValue,
    s.weightValue,
    `${formatMoney(est.annualQuarterly)}/yr quarterly, log-scaled`,
  );

  // 2. Building fit: use-class multiplier x floor-count sweet spot.
  // Story count only differentiates commercial buildings (a 20-story tower
  // is a worse target than a 4-story office); nearly all homes are 1-2
  // stories, so residential mode skips the floor-based dampening entirely.
  //
  // A story count we invented carries no information, so it must not move the
  // score either way. Most counties publish no story count at all, and the
  // estimator's fallback guesses 1 — which used to collect the short-building
  // penalty and quietly bury ground-floor retail, banks and medical offices.
  const uc = classifyUse(parcel.landUse);
  const floorFit =
    s.serviceMode === 'residential' || est.storiesAssumed
      ? 1
      : est.stories >= s.minFloors && est.stories <= s.maxFloors
        ? 1
        : est.stories < s.minFloors
          ? 0.45
          : Math.max(0.15, 1 - (est.stories - s.maxFloors) * 0.18);
  const fitWhy =
    s.serviceMode === 'residential'
      ? `${uc.kind}, ${est.stories} ${est.stories === 1 ? 'story' : 'stories'}`
      : est.storiesAssumed
        ? `${uc.kind}, floor count unknown — not scored on height`
        : `${uc.kind}, ${est.stories} fl (sweet spot ${s.minFloors}–${s.maxFloors})`;
  add('Building fit', uc.multiplier * floorFit * s.weightFit, s.weightFit, fitWhy);

  // 3. Buyer signal: owner on file, local decision-maker, above-median asset.
  let buyer = 0;
  const why: string[] = [];
  if (parcel.ownerName) {
    buyer += 0.4;
    why.push('owner on file');
  }
  const mailing = String(parcel.ownerMailing ?? '');
  if (mailing && isLocalMailing(mailing, s)) {
    buyer += 0.3;
    why.push('local decision-maker');
  } else if (mailing) {
    why.push('out-of-area owner');
  }
  const mv = parseNum(parcel.marketValue);
  if (mv > 0 && est.bldgSqft > 0 && ctx.medianValuePerSqft > 0 && mv / est.bldgSqft > ctx.medianValuePerSqft) {
    buyer += 0.3;
    why.push('above-median $/sqft');
  }
  add('Buyer signal', buyer * s.weightBuyer, s.weightBuyer, why.join(' · ') || 'no owner data');

  // 4. Portfolio owner bonus: one relationship, many roofs.
  const key = ownerKey(parcel.ownerName);
  const held = key && ctx.ownerCounts[key] ? ctx.ownerCounts[key] : 1;
  add(
    'Portfolio',
    Math.min(1, (held - 1) / 3) * s.weightPortfolio,
    s.weightPortfolio,
    held > 1 ? `owner holds ${held} parcels` : 'single property',
  );

  // 5. Route density: reward ZIPs thick with other targets in the territory.
  const zip = String(parcel.zip ?? '').slice(0, 5);
  const zipCount = zip && ctx.zipCounts[zip] ? ctx.zipCounts[zip] : 0;
  add(
    'Route density',
    (zipCount / ctx.zipMax) * s.weightDensity,
    s.weightDensity,
    `${zipCount} parcels in ZIP ${zip || '?'}`,
  );

  const rounded = Math.round(total);
  return { parts, total: rounded, grade: gradeOf(rounded) };
}
