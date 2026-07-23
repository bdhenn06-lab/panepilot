import type { ParcelInput, ScoringSettings } from '@/lib/scoring';
import { DEFAULT_SETTINGS } from '@/lib/scoring';
import type { OrgSettingsRow, ParcelRow } from './types';

export function settingsFromRow(row: OrgSettingsRow): ScoringSettings {
  return {
    serviceMode: row.service_mode ?? DEFAULT_SETTINGS.serviceMode,
    valueFloor: Number(row.value_floor ?? DEFAULT_SETTINGS.valueFloor),
    valueCeil: Number(row.value_ceil ?? DEFAULT_SETTINGS.valueCeil),
    resSqftPerWindow: Number(row.res_sqft_per_window ?? DEFAULT_SETTINGS.resSqftPerWindow),
    resPricePerWindow: Number(row.res_price_per_window ?? DEFAULT_SETTINGS.resPricePerWindow),
    resUpperStoryPct: Number(row.res_upper_story_pct ?? DEFAULT_SETTINGS.resUpperStoryPct),
    floorHeight: Number(row.floor_height),
    windowToWallPct: Number(row.window_to_wall_pct),
    windowSize: Number(row.window_size),
    panesPerWindow: Number(row.panes_per_window),
    ratePerSqft: Number(row.rate_per_sqft),
    liftFeePerFloor: Number(row.lift_fee_per_floor),
    minJob: Number(row.min_job),
    quarterlyDiscountPct: Number(row.quarterly_discount_pct),
    monthlyDiscountPct: Number(row.monthly_discount_pct),
    footprintAspect: Number(row.footprint_aspect),
    minFloors: Number(row.min_floors),
    maxFloors: Number(row.max_floors),
    weightValue: Number(row.weight_value),
    weightFit: Number(row.weight_fit),
    weightBuyer: Number(row.weight_buyer),
    weightPortfolio: Number(row.weight_portfolio),
    weightDensity: Number(row.weight_density),
    localState: row.local_state ?? DEFAULT_SETTINGS.localState,
    localCity: row.local_city ?? DEFAULT_SETTINGS.localCity,
    localZipPrefix: row.local_zip_prefix ?? DEFAULT_SETTINGS.localZipPrefix,
    regionState: row.region_state ?? DEFAULT_SETTINGS.regionState,
    companyName: row.company_name ?? '',
    contactName: row.contact_name ?? '',
    contactPhone: row.contact_phone ?? '',
    contactEmail: row.contact_email ?? '',
    homeBase: row.home_base ?? '',
  };
}

export function settingsToRow(s: ScoringSettings): Omit<OrgSettingsRow, 'org_id'> {
  return {
    service_mode: s.serviceMode,
    value_floor: s.valueFloor,
    value_ceil: s.valueCeil,
    res_sqft_per_window: s.resSqftPerWindow,
    res_price_per_window: s.resPricePerWindow,
    res_upper_story_pct: s.resUpperStoryPct,
    floor_height: s.floorHeight,
    window_to_wall_pct: s.windowToWallPct,
    window_size: s.windowSize,
    panes_per_window: s.panesPerWindow,
    rate_per_sqft: s.ratePerSqft,
    lift_fee_per_floor: s.liftFeePerFloor,
    min_job: s.minJob,
    quarterly_discount_pct: s.quarterlyDiscountPct,
    monthly_discount_pct: s.monthlyDiscountPct,
    footprint_aspect: s.footprintAspect,
    min_floors: s.minFloors,
    max_floors: s.maxFloors,
    weight_value: s.weightValue,
    weight_fit: s.weightFit,
    weight_buyer: s.weightBuyer,
    weight_portfolio: s.weightPortfolio,
    weight_density: s.weightDensity,
    local_state: s.localState,
    local_city: s.localCity,
    local_zip_prefix: s.localZipPrefix,
    region_state: s.regionState,
    company_name: s.companyName,
    contact_name: s.contactName,
    contact_phone: s.contactPhone,
    contact_email: s.contactEmail,
    home_base: s.homeBase,
  };
}

/** DB parcel row -> scoring-engine input. */
export function parcelToInput(p: ParcelRow): ParcelInput {
  return {
    address: p.address,
    city: p.city,
    zip: p.zip,
    ownerName: p.owner_name,
    ownerMailing: p.owner_mailing,
    landUse: p.land_use,
    bldgSqft: p.bldg_sqft,
    stories: p.stories,
    marketValue: p.market_value,
    yearBuilt: p.year_built,
    lat: p.lat,
    lon: p.lon,
  };
}
