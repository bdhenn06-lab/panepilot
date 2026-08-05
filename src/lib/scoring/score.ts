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

/** Score-part label -> the settings weight that funds it. */
const WEIGHT_KEYS = {
  'Contract value': 'weightValue',
  'Building fit': 'weightFit',
  'Buyer signal': 'weightBuyer',
  Portfolio: 'weightPortfolio',
  'Route density': 'weightDensity',
} as const satisfies Record<string, keyof ScoringSettings>;

/**
 * Factors that landed on the same number for every parcel in the territory.
 *
 * Such a factor cannot rank anything — it adds a constant to everyone — yet it
 * still holds its share of the 100 points. Counties that publish no owner or
 * building size leave most of the score frozen, which is why every building in
 * Hamilton graded C regardless of how good a prospect it actually was.
 */
export function deadFactors(breakdowns: ScoreBreakdown[]): string[] {
  if (breakdowns.length < 2) return [];
  const labels = Object.keys(WEIGHT_KEYS);
  return labels.filter((label) => {
    const points = breakdowns.map((b) => b.parts.find((p) => p.label === label)?.points ?? 0);
    return points.every((v) => v === points[0]);
  });
}

/**
 * Rebalance the weights onto the factors that still differentiate, keeping
 * their relative proportions and the 100-point total. Ranking order is
 * unchanged — a constant factor cannot affect order — but the surviving spread
 * now uses the full range instead of being squashed into one grade band.
 *
 * Callers should surface how many factors survived: an A earned on two live
 * signals is not the same claim as an A earned on five.
 */
export function renormalizeSettings(s: ScoringSettings, dead: string[]): ScoringSettings {
  const live = Object.keys(WEIGHT_KEYS).filter((l) => !dead.includes(l));
  if (!dead.length || !live.length) return s;

  const keyOf = (label: string) => WEIGHT_KEYS[label as keyof typeof WEIGHT_KEYS];
  const liveTotal = live.reduce((sum, l) => sum + (s[keyOf(l)] as number), 0);
  if (liveTotal <= 0) return s;

  const out = { ...s };
  for (const label of dead) (out[keyOf(label)] as number) = 0;
  for (const label of live) {
    (out[keyOf(label)] as number) = ((s[keyOf(label)] as number) / liveTotal) * 100;
  }
  return out;
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
  const marketValues: number[] = [];
  for (const p of parcels) {
    const zip = String(p.zip ?? '').slice(0, 5);
    if (zip) zipCounts[zip] = (zipCounts[zip] || 0) + 1;
    const key = ownerKey(p.ownerName);
    if (key) ownerCounts[key] = (ownerCounts[key] || 0) + 1;
    const mv = parseNum(p.marketValue);
    const sqft = parseNum(p.bldgSqft);
    if (mv > 0 && sqft > 0) valuesPerSqft.push(mv / sqft);
    if (mv > 0) marketValues.push(mv);
  }
  valuesPerSqft.sort((a, b) => a - b);
  marketValues.sort((a, b) => a - b);
  let zipMax = 1;
  for (const z of Object.keys(zipCounts)) if (zipCounts[z] > zipMax) zipMax = zipCounts[z];
  return {
    zipCounts,
    zipMax,
    ownerCounts,
    medianValuePerSqft: median(valuesPerSqft),
    // Floor at the 5th percentile to shrug off $1 placeholder values, but anchor
    // the ceiling at the actual maximum: the top of a ranked list is exactly the
    // highest-value parcels, and a 95th-percentile ceiling would pin them all at
    // full marks. Log-scaling keeps a lone very-expensive parcel from crushing
    // the rest toward the floor.
    marketValueLo: percentile(marketValues, 0.05),
    marketValueHi: marketValues.length ? marketValues[marketValues.length - 1] : 0,
  };
}

/** Value at a fraction through a pre-sorted list, or 0 when empty. */
function percentile(sorted: number[], frac: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(frac * (sorted.length - 1))));
  return sorted[idx];
}

/** Same metro as the operator — the signal actually worth acting on. */
const LOCAL_STRONG = 1;
/** Same state only. Real but weak: Cleveland is 250 miles from Cincinnati. */
const LOCAL_WEAK = 0.4;

/**
 * How local the owner's mailing address is, 0 to 1.
 *
 * These used to be OR'd into a single boolean, so with `localState = OH` every
 * owner in Ohio earned the full local-decision-maker bonus — a signal that
 * fires for the entire territory carries no information and just inflates
 * everyone equally. City and ZIP prefix indicate the same metro and stay
 * strong; state alone is now weighted down rather than treated as equivalent.
 */
export function localityStrength(mailing: string, s: ScoringSettings): number {
  if (!mailing) return 0;
  if (s.localCity && new RegExp(escapeRe(s.localCity), 'i').test(mailing)) return LOCAL_STRONG;
  if (
    s.localZipPrefix &&
    new RegExp(
      `\\b${escapeRe(s.localZipPrefix)}\\d{${Math.max(0, 5 - s.localZipPrefix.length)}}\\b`,
    ).test(mailing)
  ) {
    return LOCAL_STRONG;
  }
  if (s.localState && new RegExp(`\\b${escapeRe(s.localState)}\\b`, 'i').test(mailing)) {
    return LOCAL_WEAK;
  }
  return 0;
}

/** Is the owner local at all? Kept for callers that just need a yes/no. */
export function isLocalMailing(mailing: string, s: ScoringSettings): boolean {
  return localityStrength(mailing, s) > 0;
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
    // Renormalized weights are rarely whole numbers, and "32.7 / 36.36363636"
    // reads as a bug rather than a score.
    parts.push({
      label,
      points: Math.round(points * 10) / 10,
      max: Math.round(max * 10) / 10,
      why,
    });
    total += points;
  };

  // 1. Contract value.
  //
  // Normally this is the estimated annual clean revenue, log-scaled between the
  // floor and ceiling anchors. But that estimate is built on building size, and
  // a county with no size makes the estimator fabricate the *same* size for
  // every parcel — so the factor flatlines and thousands of buildings score
  // identically (every Hamilton parcel came out 79). When the price is a guess
  // like that, rank on the parcel's assessed market value instead: real data
  // that varies by orders of magnitude, log-scaled against the territory's own
  // 5th–95th percentile range so it adapts to any county's price level.
  const parcelValue = parseNum(parcel.marketValue);
  const useAssessed =
    est.assumed && parcelValue > 0 && ctx.marketValueHi > ctx.marketValueLo;

  const valueFrac = useAssessed
    ? Math.max(
        0,
        Math.min(
          1,
          Math.log(parcelValue / ctx.marketValueLo) /
            Math.log(ctx.marketValueHi / ctx.marketValueLo),
        ),
      )
    : Math.max(
        0,
        Math.min(
          1,
          Math.log((est.annualQuarterly || 1) / s.valueFloor) / Math.log(s.valueCeil / s.valueFloor),
        ),
      );
  add(
    'Contract value',
    valueFrac * s.weightValue,
    s.weightValue,
    useAssessed
      ? `${formatMoney(parcelValue)} assessed value, ranked in territory`
      : `${formatMoney(est.annualQuarterly)}/yr quarterly, log-scaled`,
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
  const local = mailing ? localityStrength(mailing, s) : 0;
  if (local >= LOCAL_STRONG) {
    buyer += 0.3;
    why.push('local decision-maker');
  } else if (local > 0) {
    buyer += 0.3 * local;
    why.push('owner in-state, outside the metro');
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
