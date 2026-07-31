import { classifyUse } from './classify';
import type { BuildingUseClass } from './types';

/**
 * Calibration from realized outcomes.
 *
 * Every price and crew-time figure is a formula applied to county records, and
 * nothing about whether it was right ever fed back in — every coefficient was
 * an untested opinion. This closes one narrow loop: when a job actually
 * closes, compare what was quoted to what was charged and how long it took,
 * grouped by building type, and nudge future estimates toward reality.
 *
 * Deliberately narrow. It cannot recover a building's true square footage —
 * no amount of outcome data manufactures information a county never
 * published. What it CAN do is correct a systematic bias in the estimator's
 * assumptions: if every "Office" job in this territory runs 20% over quote,
 * that is learnable from a handful of closes and should stop repeating.
 */

export interface JobOutcome {
  landUse: string | null;
  estimatedPrice: number;
  actualPrice: number;
  estimatedHours?: number | null;
  actualHours?: number | null;
}

export interface Calibration {
  priceMultiplier: Partial<Record<BuildingUseClass['kind'], number>>;
  hoursMultiplier: Partial<Record<BuildingUseClass['kind'], number>>;
}

/**
 * Below this many closes for a building type, the estimator's original
 * assumption stands. A ratio computed from one or two jobs is noise, not a
 * correction — and confidently recalibrating on noise is worse than admitting
 * there isn't enough data yet.
 */
export const MIN_OUTCOMES_FOR_CALIBRATION = 3;

/** Bounds a multiplier so one data-entry error can't send future quotes to zero or triple them. */
const MIN_MULTIPLIER = 0.5;
const MAX_MULTIPLIER = 2;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Ratios grouped by use-class kind, then reduced to one clamped multiplier per group. */
function ratiosByUseClass(
  outcomes: JobOutcome[],
  ratioOf: (o: JobOutcome) => number | null,
): Partial<Record<BuildingUseClass['kind'], number>> {
  const grouped: Partial<Record<BuildingUseClass['kind'], number[]>> = {};
  for (const o of outcomes) {
    const ratio = ratioOf(o);
    if (ratio == null || !Number.isFinite(ratio)) continue;
    const kind = classifyUse(o.landUse).kind;
    (grouped[kind] ??= []).push(ratio);
  }

  const out: Partial<Record<BuildingUseClass['kind'], number>> = {};
  for (const [kind, ratios] of Object.entries(grouped) as [BuildingUseClass['kind'], number[]][]) {
    if (ratios.length < MIN_OUTCOMES_FOR_CALIBRATION) continue;
    out[kind] = Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, median(ratios)));
  }
  return out;
}

export function computeCalibration(outcomes: JobOutcome[]): Calibration {
  return {
    priceMultiplier: ratiosByUseClass(outcomes, (o) =>
      o.estimatedPrice > 0 ? o.actualPrice / o.estimatedPrice : null,
    ),
    hoursMultiplier: ratiosByUseClass(outcomes, (o) =>
      o.estimatedHours && o.estimatedHours > 0 && o.actualHours != null
        ? o.actualHours / o.estimatedHours
        : null,
    ),
  };
}

/** Multiplier for one building, or 1 (no adjustment) when nothing is calibrated for its type yet. */
export function priceCalibrationFor(landUse: string | null | undefined, cal: Calibration): number {
  return cal.priceMultiplier[classifyUse(landUse).kind] ?? 1;
}

export function hoursCalibrationFor(landUse: string | null | undefined, cal: Calibration): number {
  return cal.hoursMultiplier[classifyUse(landUse).kind] ?? 1;
}
