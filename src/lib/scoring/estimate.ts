import { parseNum } from './classify';
import { priceCalibrationFor, type Calibration } from './feedback';
import type { Estimate, ParcelInput, ScoringSettings } from './types';

interface Assumption {
  stories: number;
  bldgSqft: number;
  assumed: boolean;
  storiesAssumed: boolean;
}

/** Commercial size assumptions: bigger buildings get more assumed floors. */
function assumeCommercial(rawStories: number, rawSqft: number): Assumption {
  let stories = rawStories;
  let bldgSqft = rawSqft;
  let assumed = false;
  const storiesAssumed = !stories;
  if (!stories) {
    stories = bldgSqft > 40000 ? 3 : bldgSqft > 15000 ? 2 : 1;
    assumed = true;
  }
  if (!bldgSqft) {
    bldgSqft = stories * 8000;
    assumed = true;
  }
  return { stories, bldgSqft, assumed, storiesAssumed };
}

/** Residential size assumptions: most homes are 1-2 stories. */
function assumeResidential(rawStories: number, rawSqft: number): Assumption {
  let stories = rawStories;
  let bldgSqft = rawSqft;
  let assumed = false;
  const storiesAssumed = !stories;
  if (!stories) {
    stories = bldgSqft > 1600 ? 2 : 1;
    assumed = true;
  }
  if (!bldgSqft) {
    bldgSqft = stories * 1200;
    assumed = true;
  }
  return { stories, bldgSqft, assumed, storiesAssumed };
}

/**
 * Facade model: estimate windows and pricing for a property from county-
 * record sq ft + stories. Two independent models depending on org settings:
 *
 * Commercial — glass = perimeter x stories x floor height x window-to-wall
 * ratio, where the perimeter comes from a rectangular footprint with a
 * configurable aspect ratio; priced per sq ft of glass plus a per-floor lift
 * fee.
 *
 * Residential — windows estimated from finished sq ft via a per-window area
 * ratio; priced per window flat rate with a surcharge per story above the
 * first (ladder/access difficulty). No glass-area or lift-fee concept.
 *
 * Missing stories/sq ft are assumed from each other in both models.
 *
 * `calibration` is optional and comes from realized outcomes on past jobs
 * (see `feedback.ts`) — it nudges the raw formula price toward what this org
 * actually charges for this building type, once enough closes exist to trust
 * it. With no calibration, or none yet for this use class, behaves exactly as
 * before.
 */
export function estimate(
  parcel: ParcelInput,
  s: ScoringSettings,
  calibration?: Calibration,
): Estimate {
  const rawStories = parseNum(parcel.stories);
  const rawSqft = parseNum(parcel.bldgSqft);
  const priceCal = calibration ? priceCalibrationFor(parcel.landUse, calibration) : 1;

  let stories: number;
  let bldgSqft: number;
  let assumed: boolean;
  let storiesAssumed: boolean;
  let glassSqft: number;
  let windows: number;
  let pricePerClean: number;

  if (s.serviceMode === 'residential') {
    ({ stories, bldgSqft, assumed, storiesAssumed } = assumeResidential(rawStories, rawSqft));
    glassSqft = 0; // not a meaningful figure for the per-window residential model
    windows = Math.max(1, Math.round(bldgSqft / s.resSqftPerWindow));
    const upperStorySurcharge = 1 + Math.max(0, stories - 1) * (s.resUpperStoryPct / 100);
    pricePerClean = Math.max(
      s.minJob,
      Math.round((windows * s.resPricePerWindow * upperStorySurcharge * priceCal) / 5) * 5,
    );
  } else {
    ({ stories, bldgSqft, assumed, storiesAssumed } = assumeCommercial(rawStories, rawSqft));
    const footprint = bldgSqft / Math.max(1, stories);
    const width = Math.sqrt(footprint / s.footprintAspect);
    const perimeter = 2 * (width + s.footprintAspect * width);
    glassSqft = perimeter * stories * s.floorHeight * (s.windowToWallPct / 100);
    windows = Math.max(1, Math.round(glassSqft / s.windowSize));
    pricePerClean = Math.max(
      s.minJob,
      Math.round(((glassSqft * s.ratePerSqft + stories * s.liftFeePerFloor) * priceCal) / 5) * 5,
    );
  }

  return {
    stories,
    bldgSqft,
    glassSqft,
    windows,
    panes: Math.round(windows * s.panesPerWindow),
    pricePerClean,
    annualQuarterly: pricePerClean * 4 * (1 - s.quarterlyDiscountPct / 100),
    annualMonthly: pricePerClean * 12 * (1 - s.monthlyDiscountPct / 100),
    assumed,
    storiesAssumed,
  };
}
