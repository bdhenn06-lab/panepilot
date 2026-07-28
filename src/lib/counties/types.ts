/**
 * Types for the county data catalog.
 *
 * A "source" is one queryable ArcGIS layer plus everything needed to turn it
 * into PanePilot parcels: which attribute holds which field, and the server-side
 * filter that isolates commercial or residential property.
 */

/** One attribute name, or several to join with spaces (split addresses). */
export type FieldRef = string | string[];

export interface CountyFieldMap {
  parcelid?: FieldRef;
  address: FieldRef;
  city?: FieldRef;
  zip?: FieldRef;
  owner?: FieldRef;
  mailing?: FieldRef;
  landuse?: FieldRef;
  bldgsqft?: FieldRef;
  stories?: FieldRef;
  value?: FieldRef;
  yearbuilt?: FieldRef;
}

/**
 * What the source actually provides. Drives the honest coverage badge in the
 * UI — a county with no owner name can't do portfolio grouping, and one with no
 * building size falls back to estimator assumptions for every price.
 */
export interface CountyCoverage {
  owner: boolean;
  bldgSqft: boolean;
  value: boolean;
  zip: boolean;
}

export interface CountySource {
  /** Stable id, e.g. "oh-hamilton-cagis". */
  id: string;
  /** Two-letter state, used as the address state when ZIPs aren't available. */
  state: string;
  county: string;
  label: string;
  /** Full ArcGIS layer URL, ending in /FeatureServer/0 or /MapServer/0. */
  serviceUrl: string;
  fields: CountyFieldMap;
  /** Server-side filters so we page only the rows we want. */
  where: { commercial: string; residential: string };
  /** Object ID field name for stable paging. Most services use 'OBJECTID'; some (SANDAG) use lowercase. */
  objectIdField?: string;
  coverage: CountyCoverage;
  /** Shown in the picker — caveats, or a better alternative. */
  note?: string;
}

/** A parcel normalized out of an ArcGIS feature, ready for the parcels table. */
export interface NormalizedParcel {
  parcel_number: string | null;
  address: string;
  city: string | null;
  zip: string | null;
  owner_name: string | null;
  owner_mailing: string | null;
  land_use: string | null;
  bldg_sqft: number | null;
  stories: number | null;
  market_value: number | null;
  year_built: number | null;
  lat: number | null;
  lon: number | null;
}
