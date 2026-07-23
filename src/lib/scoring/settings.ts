import type { ScoringSettings, ServiceMode } from './types';

/**
 * Default coefficients — identical to the prototype's DEF constants.
 * Local-market markers default to the Cincinnati design partner but are
 * plain org settings; nothing downstream assumes Hamilton County.
 */
export const DEFAULT_SETTINGS: ScoringSettings = {
  serviceMode: 'commercial',
  valueFloor: 400,
  valueCeil: 60000,
  resSqftPerWindow: 130,
  resPricePerWindow: 9,
  resUpperStoryPct: 25,
  floorHeight: 11,
  windowToWallPct: 45,
  windowSize: 21,
  panesPerWindow: 1.8,
  ratePerSqft: 0.09,
  liftFeePerFloor: 45,
  minJob: 150,
  quarterlyDiscountPct: 15,
  monthlyDiscountPct: 28,
  footprintAspect: 1.8,
  minFloors: 2,
  maxFloors: 8,
  weightValue: 30,
  weightFit: 20,
  weightBuyer: 20,
  weightPortfolio: 15,
  weightDensity: 15,
  localState: 'OH',
  localCity: 'Cincinnati',
  localZipPrefix: '45',
  regionState: 'OH',
  companyName: 'Whiteline Window Washing',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  homeBase: 'Cincinnati, OH',
};

/** Fill any missing keys with defaults (settings rows written by older versions). */
export function withDefaults(partial: Partial<ScoringSettings> | null | undefined): ScoringSettings {
  return { ...DEFAULT_SETTINGS, ...(partial ?? {}) };
}

/**
 * Starting coefficients to apply when an org switches service mode — mainly
 * the value-score anchors, which are ~10-50x apart between a commercial
 * contract and a residential clean and would otherwise silently zero out
 * every score. Applied on an explicit mode switch in Settings, not merged
 * automatically, so a team's tuned numbers are never overwritten in place.
 */
export function defaultsForMode(mode: ServiceMode): Partial<ScoringSettings> {
  if (mode === 'residential') {
    return {
      serviceMode: 'residential',
      valueFloor: 100,
      valueCeil: 3000,
      resSqftPerWindow: 130,
      resPricePerWindow: 9,
      resUpperStoryPct: 25,
    };
  }
  return {
    serviceMode: 'commercial',
    valueFloor: 400,
    valueCeil: 60000,
  };
}
