# PanePilot

Customer acquisition OS for commercial window cleaning companies. Imports county
auditor parcel CSVs, estimates every building's glass + contract value from a
facade model, ranks prospects with the transparent 0–100 PaneScore, and runs a
5-touch outreach cadence with routes, proposals, and a shared team pipeline.

Production rebuild of the validated single-file prototype (`PanePilot-Cloud`).

## Stack

- Next.js (App Router) + TypeScript + Tailwind v4 — deploys on Vercel
- Supabase: auth (email/password + magic link), Postgres, per-org row-level security
- Multi-tenant: one org per window cleaning company; members share the org's
  parcels, settings, pipeline, and routes
- CSV parsing is fully client-side (Papa Parse streaming — 100MB files are fine);
  only extracted commercial rows upload, in batches of 500

## One-time setup (~10 minutes)

1. **Supabase project**: [supabase.com](https://supabase.com) → New project.
2. **Schema**: SQL Editor → paste `supabase/migrations/0001_init.sql` → Run.
3. **Keys**: Project Settings → API → copy Project URL + anon key into
   `.env.local` (start from `.env.example`).
4. **Auth settings** (Supabase → Authentication):
   - URL Configuration → set Site URL to your deployed URL (or `http://localhost:3000`),
     and add it to Redirect URLs — magic links land on `/auth/callback`.
   - Optionally disable "Confirm email" for instant signups while testing.

## Run locally

```
npm install
npm run dev        # http://localhost:3000
npm test           # scoring engine unit tests (vitest)
npm run build      # production build
```

## Deploy (Vercel)

Import the repo in Vercel, set the two `NEXT_PUBLIC_SUPABASE_*` env vars, deploy.
Add the production URL to Supabase Auth → Redirect URLs.

## Architecture notes

- `src/lib/scoring/` — the IP. Pure TypeScript, no framework imports, fully
  unit-tested against the prototype's constants (`npm test`). Estimation
  (facade model), PaneScore (5 weighted factors with per-factor breakdown),
  owner normalization, cadence math, CSV column auto-detection, outreach
  copy generation, nearest-neighbor route ordering.
- `src/components/workspace.tsx` — client data layer. Loads the org's parcels +
  pipeline state once (paged), scores in memory (scoring needs whole-territory
  context: ZIP density, median $/sqft, portfolio counts), writes changes back
  with a short debounce. Same architecture the prototype validated.
- `supabase/migrations/` — run each file in order in the SQL Editor.
  `0001_init.sql`: orgs, org_members, org_invites, org_settings (typed
  coefficient columns), parcels (real columns, indexed), prospect_state,
  routes; RLS on everything via `is_org_member()` / `is_org_admin()`;
  multi-table mutations are `security definer` RPCs. `0002_residential_mode.sql`:
  per-org commercial/residential service mode + configurable score anchors.
  `0003_realtime.sql`: live team sync on prospect_state.
- **Service modes**: each org runs Commercial (perimeter/glass facade model,
  B2B outreach) or Residential (per-window pricing, homeowner outreach) —
  Settings → Service type. Scoring anchors, pricing fields, land-use import
  filter, and outreach copy all follow the mode.
- **Re-imports keep the pipeline** (`src/lib/carryover.ts`): dropping a
  fresher county export snapshots statuses/notes/routes by parcel number,
  replaces the dataset, and reattaches everything that still matches.
- **Realtime**: teammates' status/note/sequence changes stream in live
  (Supabase Realtime on prospect_state; own writes are echo-suppressed).
- Nothing Hamilton-specific is hardcoded: the "local buyer" markers
  (city/state/ZIP-prefix), address state, and every pricing/scoring
  coefficient live in org settings, defaulted for the Cincinnati design partner.
- Billing (`/billing`): Solo $79 / Crew $199 / Franchise $499 stub behind
  `NEXT_PUBLIC_BILLING_ENABLED`; orgs already carry `plan` and Stripe columns.

## Team invites

Settings → Team → Create invite link. Invites are shareable 14-day links
(`/invite/<token>`) — no email service is wired up, the link is the invite.
