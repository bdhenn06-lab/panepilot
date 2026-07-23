-- Adds residential window-cleaning support alongside commercial.
-- Additive only: every default reproduces today's hardcoded commercial
-- behavior exactly, so existing orgs (Whiteline) are unaffected.

alter table public.org_settings
  add column service_mode text not null default 'commercial'
    check (service_mode in ('commercial', 'residential')),
  add column value_floor numeric not null default 400,
  add column value_ceil numeric not null default 60000,
  add column res_sqft_per_window numeric not null default 130,
  add column res_price_per_window numeric not null default 9,
  add column res_upper_story_pct numeric not null default 25;
