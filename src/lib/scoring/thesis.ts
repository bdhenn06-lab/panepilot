import { parseNum, classifyUse } from './classify';
import { hoursCalibrationFor, type Calibration } from './feedback';
import { ownerKey } from './owner';
import { localityStrength } from './score';
import type { Estimate, ParcelInput, ScoringSettings, TerritoryContext } from './types';

/**
 * The job thesis: what the operator reads instead of a 0-100 score.
 *
 * The score answers "how does this rank?" — a question the owner didn't ask.
 * What they act on is money, crew time, and one concrete reason to knock. This
 * translates the same inputs the score already uses into that shape, so the
 * ranking stays sophisticated while the surface stays plain.
 *
 * Everything here is presented as a range or a hedge on purpose. A single
 * decimal price reads as false precision to someone who has bid buildings for
 * twenty years, and anchoring a customer to a wrong exact number is worse than
 * admitting the spread.
 */

/**
 * Exterior glass one person can clean per hour, pole/ladder work. Conservative
 * mid-range: real productivity swings on access, height, and how filthy the
 * glass is, which is why the output is a range and never a promise.
 */
const GLASS_SQFT_PER_PERSON_HOUR = 400;

/** Residential equivalent — the per-window model has no meaningful glass area. */
const WINDOWS_PER_PERSON_HOUR = 12;

/** Standard two-person crew, the default for both service modes. */
const CREW_SIZE = 2;

/** How far the quote band spreads either side of the estimate. */
const PRICE_BAND = 0.15;

/** How far the crew-time band spreads — access surprises hit time harder than price. */
const TIME_BAND = 0.25;

export interface JobThesis {
  /** Low end of the first-clean quote band, dollars. */
  priceLow: number;
  /** High end of the first-clean quote band, dollars. */
  priceHigh: number;
  /** Recurring annual value on the quarterly plan, unchanged from the estimate. */
  annualValue: number;
  crewHoursLow: number;
  crewHoursHigh: number;
  /** Plain-English crew line, e.g. "2 crew · about 3–4 hrs". */
  crewNote: string;
  /** The single most compelling reason to approach this building. */
  headline: string;
  /** How much of this rests on county data vs. our assumptions. */
  confidence: 'high' | 'medium' | 'low';
  confidenceWhy: string;
}

/** Round to the nearest $25 so the band reads like a quote, not a calculation. */
function roundPrice(v: number): number {
  return Math.max(25, Math.round(v / 25) * 25);
}

/** Round to the nearest half hour, floored so nothing reads as a zero-hour job. */
function roundHours(v: number): number {
  return Math.max(0.5, Math.round(v * 2) / 2);
}

/** Human label for a use class, for the fallback headline. */
const USE_LABELS: Record<string, string> = {
  office: 'Office',
  medical: 'Medical',
  hotel: 'Hotel',
  retail: 'Retail',
  mixed: 'Mixed-use',
  industrial: 'Industrial',
  commercial: 'Commercial',
  single_family: 'Single-family home',
  condo_townhome: 'Condo / townhome',
  small_multifamily: 'Small multifamily',
};

/**
 * Pick the one reason worth leading with, in descending order of how much it
 * changes the sales approach. Portfolio beats everything: one relationship
 * opening several roofs reframes the call entirely.
 */
function headlineReason(
  parcel: ParcelInput,
  est: Estimate,
  ctx: TerritoryContext,
  s: ScoringSettings,
): string {
  const key = ownerKey(parcel.ownerName);
  const held = key && ctx.ownerCounts[key] ? ctx.ownerCounts[key] : 1;
  if (held >= 2) {
    return `Same owner holds ${held} properties here — one call opens all of them`;
  }

  const mv = parseNum(parcel.marketValue);
  if (mv > 0 && est.bldgSqft > 0 && ctx.medianValuePerSqft > 0) {
    if (mv / est.bldgSqft > ctx.medianValuePerSqft) {
      return 'Premium building for this area — above-median value per sq ft';
    }
  }

  // Only claim "local" for a same-metro match. A state-only hit is too weak to
  // headline — telling someone in Cincinnati that a Cleveland owner is local
  // burns trust the first time they check.
  const mailing = String(parcel.ownerMailing ?? '');
  if (mailing && localityStrength(mailing, s) >= 1) {
    const where = s.localCity || s.localState;
    return where
      ? `Locally owned — the decision-maker is in ${where}`
      : 'Locally owned — the decision-maker is nearby';
  }

  const zip = String(parcel.zip ?? '').slice(0, 5);
  const zipCount = zip && ctx.zipCounts[zip] ? ctx.zipCounts[zip] : 0;
  if (zipCount >= 3) {
    return `${zipCount} nearby targets in ZIP ${zip} — tight route, low windshield time`;
  }

  const label = USE_LABELS[classifyUse(parcel.landUse).kind] ?? 'Commercial';
  const floors = est.stories === 1 ? '1 story' : `${est.stories} stories`;
  return `${label} building, ${floors}`;
}

/**
 * Turn a scored parcel into the money-and-action summary an operator can act on
 * from the truck. Same inputs as `paneScore` so the two never disagree.
 */
export function jobThesis(
  parcel: ParcelInput,
  est: Estimate,
  ctx: TerritoryContext,
  s: ScoringSettings,
  calibration?: Calibration,
): JobThesis {
  const priceLow = roundPrice(est.pricePerClean * (1 - PRICE_BAND));
  const priceHigh = roundPrice(est.pricePerClean * (1 + PRICE_BAND));

  // Residential prices per window and reports no glass area, so the two modes
  // need different work units to land on the same "hours" figure.
  const personHours =
    s.serviceMode === 'residential'
      ? est.windows / WINDOWS_PER_PERSON_HOUR
      : est.glassSqft / GLASS_SQFT_PER_PERSON_HOUR;
  const hoursCal = calibration ? hoursCalibrationFor(parcel.landUse, calibration) : 1;
  const crewHours = (personHours / CREW_SIZE) * hoursCal;
  const crewHoursLow = roundHours(crewHours * (1 - TIME_BAND));
  const crewHoursHigh = roundHours(Math.max(crewHours * (1 + TIME_BAND), crewHoursLow + 0.5));

  const hrs =
    crewHoursLow === crewHoursHigh
      ? `${crewHoursLow} hr`
      : `${crewHoursLow}–${crewHoursHigh} hrs`;

  let confidence: JobThesis['confidence'];
  let confidenceWhy: string;
  if (est.assumed) {
    confidence = 'low';
    confidenceWhy = 'Building size assumed — the county had no sq ft on file';
  } else if (!parcel.ownerName) {
    confidence = 'medium';
    confidenceWhy = 'Size is from county records, but no owner on file to contact';
  } else {
    confidence = 'high';
    confidenceWhy = 'Building size and owner both from county records';
  }

  return {
    priceLow,
    priceHigh,
    annualValue: est.annualQuarterly,
    crewHoursLow,
    crewHoursHigh,
    crewNote: `${CREW_SIZE} crew · about ${hrs}`,
    headline: headlineReason(parcel, est, ctx, s),
    confidence,
    confidenceWhy,
  };
}
