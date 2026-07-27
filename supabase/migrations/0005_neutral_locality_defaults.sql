-- PanePilot is sold nationwide, but org_settings shipped with the Cincinnati
-- design partner's market baked into the column defaults. A workspace in any
-- other state silently got:
--   * region_state 'OH' appended to every property address (proposals, emails,
--     Google Maps links all showed the wrong state)
--   * Ohio/Cincinnati/45xxx treated as the "local decision-maker" buyer signal,
--     so in-market owners scored as out-of-area and vice versa
--
-- Defaults are now neutral; the app derives the real market from the parcels on
-- import (src/lib/scoring/locality.ts). Existing rows are left alone — only new
-- workspaces pick up the new defaults.

alter table public.org_settings
  alter column local_state set default '',
  alter column local_city set default '',
  alter column local_zip_prefix set default '',
  alter column region_state set default '';
