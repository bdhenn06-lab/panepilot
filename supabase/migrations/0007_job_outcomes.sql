-- Feedback loop: what actually happened on a job, once it closes.
--
-- Every price and crew-time estimate is currently a formula applied to county
-- records, with no way to learn it was wrong. This table captures the two
-- numbers that matter once a deal is won -- what was actually charged, and how
-- long it actually took -- against what the estimator predicted at the time.
--
-- Deliberately narrow: it cannot recover a building's true size or teach the
-- algorithm anything a county didn't publish. What it CAN do is correct a
-- systematic bias in the estimator's assumptions per building type -- if every
-- "Office" job in this territory runs 20% over the quoted price, that is
-- learnable from a handful of outcomes and should stop repeating.
--
-- land_use and service_mode are snapshotted at close time rather than joined
-- from parcels, so a calibration stays meaningful even after a re-import
-- changes or removes the underlying parcel.

create table public.job_outcomes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  parcel_id bigint references public.parcels (id) on delete set null,
  land_use text,
  service_mode text not null check (service_mode in ('commercial', 'residential')),
  estimated_price numeric not null,
  actual_price numeric not null,
  estimated_hours numeric,
  actual_hours numeric,
  closed_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index job_outcomes_org_idx on public.job_outcomes (org_id);

alter table public.job_outcomes enable row level security;

create policy "members all job_outcomes" on public.job_outcomes
  for all to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
