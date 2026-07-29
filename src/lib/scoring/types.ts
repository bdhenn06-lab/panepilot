/**
 * Core domain types for the PaneScore engine.
 * Everything in this module is pure: no I/O, no framework imports.
 */

/** Which business the org runs — changes the facade model, value-score anchors, and outreach copy. */
export type ServiceMode = 'commercial' | 'residential';

/** All user-configurable coefficients. Mirrors the prototype's DEF object. */
export interface ScoringSettings {
  /** Commercial (perimeter/glass-area) or residential (per-window) pricing + scoring. */
  serviceMode: ServiceMode;
  /** Log-scale anchors for the contract-value score factor: $/yr that scores 0 and 1. */
  valueFloor: number;
  valueCeil: number;
  /** Residential facade model: estimate windows from finished sqft. */
  resSqftPerWindow: number;
  /** Residential pricing: flat rate per window. */
  resPricePerWindow: number;
  /** Residential pricing: % surcharge per story above the first (ladder/access difficulty). */
  resUpperStoryPct: number;
  /** Assumed floor-to-floor height in feet. */
  floorHeight: number;
  /** Window-to-wall ratio, percent (0-100). */
  windowToWallPct: number;
  /** Average window size in sq ft of glass. */
  windowSize: number;
  /** Panes per window multiplier. */
  panesPerWindow: number;
  /** Price per sq ft of glass, dollars. */
  ratePerSqft: number;
  /** Lift/equipment fee per story, dollars. */
  liftFeePerFloor: number;
  /** Minimum job price, dollars. */
  minJob: number;
  /** Quarterly plan discount, percent. */
  quarterlyDiscountPct: number;
  /** Monthly plan discount, percent. */
  monthlyDiscountPct: number;
  /** Assumed footprint aspect ratio (length/width). */
  footprintAspect: number;
  /** Ideal floor range for scoring fit. */
  minFloors: number;
  maxFloors: number;
  /** PaneScore factor weights (sum to 100 by default). */
  weightValue: number;
  weightFit: number;
  weightBuyer: number;
  weightPortfolio: number;
  weightDensity: number;
  /** Markers identifying a "local" owner mailing address (buyer signal). */
  localState: string;
  localCity: string;
  localZipPrefix: string;
  /** State abbreviation appended when composing full street addresses. */
  regionState: string;
  /** Identity used in outreach + proposals. */
  companyName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  /** Route start address for the route builder. */
  homeBase: string;
}

/** A parcel as the scoring engine sees it (already normalized from CSV/DB). */
export interface ParcelInput {
  address: string;
  city?: string | null;
  zip?: string | null;
  ownerName?: string | null;
  ownerMailing?: string | null;
  landUse?: string | null;
  bldgSqft?: number | string | null;
  stories?: number | string | null;
  marketValue?: number | string | null;
  yearBuilt?: number | string | null;
  lat?: number | string | null;
  lon?: number | string | null;
}

/** Output of the facade model. */
export interface Estimate {
  stories: number;
  bldgSqft: number;
  /** Estimated exterior glass area, sq ft. */
  glassSqft: number;
  windows: number;
  panes: number;
  /** Price per one-time exterior clean, dollars. */
  pricePerClean: number;
  /** Annual value on the quarterly plan (4 cleans, discounted). */
  annualQuarterly: number;
  /** Annual value on the monthly plan (12 cleans, discounted). */
  annualMonthly: number;
  /** True when sq ft or stories had to be assumed. */
  assumed: boolean;
  /**
   * True when the story count specifically was invented. Kept separate from
   * `assumed` because only this one decides the floor-fit penalty — a building
   * with real stories but missing sq ft still deserves that penalty.
   */
  storiesAssumed: boolean;
}

export interface ScorePart {
  label: string;
  points: number;
  max: number;
  why: string;
}

export type Grade = 'A' | 'B' | 'C' | 'D';

export interface ScoreBreakdown {
  parts: ScorePart[];
  total: number;
  grade: Grade;
}

/** Aggregates computed over the whole territory, needed to score one parcel. */
export interface TerritoryContext {
  /** Commercial parcel count per 5-digit ZIP. */
  zipCounts: Record<string, number>;
  /** Highest ZIP count (>= 1). */
  zipMax: number;
  /** Parcel count per normalized owner key. */
  ownerCounts: Record<string, number>;
  /** Median market value per building sq ft across the territory. */
  medianValuePerSqft: number;
}

export interface BuildingUseClass {
  kind:
    | 'office'
    | 'medical'
    | 'hotel'
    | 'retail'
    | 'mixed'
    | 'industrial'
    | 'commercial'
    | 'single_family'
    | 'condo_townhome'
    | 'small_multifamily';
  multiplier: number;
}
