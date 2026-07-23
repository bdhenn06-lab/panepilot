import type { ProspectStatus } from '@/lib/scoring';

/** Row shapes as they come back from Supabase (snake_case). */

export interface OrgRow {
  id: string;
  name: string;
  plan: 'trial' | 'solo' | 'crew' | 'franchise';
  created_at: string;
}

export interface OrgMemberRow {
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
}

export interface OrgInviteRow {
  id: string;
  org_id: string;
  email: string;
  role: 'admin' | 'member';
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface OrgSettingsRow {
  org_id: string;
  service_mode: 'commercial' | 'residential';
  value_floor: number;
  value_ceil: number;
  res_sqft_per_window: number;
  res_price_per_window: number;
  res_upper_story_pct: number;
  floor_height: number;
  window_to_wall_pct: number;
  window_size: number;
  panes_per_window: number;
  rate_per_sqft: number;
  lift_fee_per_floor: number;
  min_job: number;
  quarterly_discount_pct: number;
  monthly_discount_pct: number;
  footprint_aspect: number;
  min_floors: number;
  max_floors: number;
  weight_value: number;
  weight_fit: number;
  weight_buyer: number;
  weight_portfolio: number;
  weight_density: number;
  local_state: string;
  local_city: string;
  local_zip_prefix: string;
  region_state: string;
  company_name: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  home_base: string;
}

export interface ParcelRow {
  id: number;
  org_id: string;
  parcel_number: string | null;
  address: string;
  city: string | null;
  zip: string | null;
  owner_name: string | null;
  owner_key: string | null;
  owner_mailing: string | null;
  land_use: string | null;
  bldg_sqft: number | null;
  stories: number | null;
  market_value: number | null;
  year_built: number | null;
  lat: number | null;
  lon: number | null;
}

export interface ProspectStateRow {
  parcel_id: number;
  org_id: string;
  status: ProspectStatus;
  touch: number;
  last_touch: string | null;
  due: string | null;
  notes: string;
  updated_by: string | null;
  updated_at: string;
}

export interface RouteRow {
  id: string;
  org_id: string;
  name: string;
  stops: number[];
  created_by: string | null;
  updated_at: string;
}
