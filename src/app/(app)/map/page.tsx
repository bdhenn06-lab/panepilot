'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspace } from '@/components/workspace';
import { useToast } from '@/components/toast';
import { Button, Callout, Card, Ghost, GhostLink } from '@/components/ui';
import { IconMap, IconRoute, IconTrash } from '@/components/icons';
import { Loading } from '@/components/loading';
import { EmptyRedirect } from '@/components/empty-redirect';
import {
  coordOf,
  formatMoney,
  formatNum,
  googleMapsRouteUrl,
  orderStops,
} from '@/lib/scoring';

const GEOCODE_BATCH = 500;

const TerritoryMap = dynamic(() => import('@/components/territory-map'), {
  ssr: false,
  loading: () => <div className="h-[440px] rounded-xl border border-line bg-soft" />,
});

export default function MapPage() {
  const ws = useWorkspace();
  const toast = useToast();
  const [geocoding, setGeocoding] = useState(false);
  const [geoProgress, setGeoProgress] = useState('');

  const withCoords = useMemo(() => ws.scored.filter((x) => coordOf(x.input)), [ws.scored]);

  // Parcels with a street address but no usable coordinates — candidates for geocoding.
  const missingCoords = useMemo(
    () => ws.parcels.filter((p) => p.address && !coordOf({ lat: p.lat, lon: p.lon })),
    [ws.parcels],
  );

  async function geocodeMissing() {
    if (!missingCoords.length) return;
    setGeocoding(true);
    const supabase = createClient();
    const state = ws.settings.regionState || '';
    let matched = 0;
    try {
      for (let i = 0; i < missingCoords.length; i += GEOCODE_BATCH) {
        const batch = missingCoords.slice(i, i + GEOCODE_BATCH);
        setGeoProgress(
          `Geocoding ${formatNum(Math.min(i + GEOCODE_BATCH, missingCoords.length))} / ${formatNum(missingCoords.length)}…`,
        );
        const res = await fetch('/api/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            addresses: batch.map((p) => ({
              id: p.id,
              street: (p.address || '').split(',')[0],
              city: p.city || '',
              state,
              zip: String(p.zip || '').slice(0, 5),
            })),
          }),
        });
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(error);
        }
        const { results } = (await res.json()) as { results: { id: number; lat: number; lon: number }[] };
        // Write matches back through the authenticated session (RLS applies).
        for (const r of results) {
          const { error } = await supabase
            .from('parcels')
            .update({ lat: r.lat, lon: r.lon })
            .eq('id', r.id)
            .eq('org_id', ws.orgId);
          if (!error) matched++;
        }
      }
      setGeoProgress('');
      await ws.refresh();
      toast(`Geocoded ${formatNum(matched)} of ${formatNum(missingCoords.length)} addresses`);
    } catch (e) {
      toast(`Geocoding failed: ${e instanceof Error ? e.message : 'unknown error'}`);
      setGeoProgress('');
    } finally {
      setGeocoding(false);
    }
  }

  const routeStops = useMemo(() => {
    const stops = ws.route
      .map((id) => ws.byId.get(id))
      .filter((x): x is NonNullable<typeof x> => !!x)
      .map((x) => ({ x, coord: coordOf(x.input) }));
    return orderStops(stops);
  }, [ws.route, ws.byId]);

  if (ws.loading) return <Loading />;
  if (!ws.parcels.length) return <EmptyRedirect />;

  const routeTotal = routeStops.reduce((a, s) => a + s.x.est.annualQuarterly, 0);
  const mapsUrl = googleMapsRouteUrl(
    routeStops.map((s) => s.x.input),
    ws.settings,
  );

  return (
    <div>
      <div className="flex items-center gap-2.5 flex-wrap mb-2.5">
        <p className="text-base font-semibold">Map &amp; routes</p>
        <span className="text-xs text-ink2">
          {formatNum(withCoords.length)} of {formatNum(ws.scored.length)} parcels have coordinates
        </span>
        {missingCoords.length > 0 && (
          <Button className="!h-8 !text-xs" disabled={geocoding} onClick={() => void geocodeMissing()}>
            <IconMap />
            {geocoding
              ? geoProgress || 'Geocoding…'
              : `Geocode ${formatNum(missingCoords.length)} addresses`}
          </Button>
        )}
        <span className="ml-auto flex gap-2 items-center text-[11px] font-semibold">
          <span className="rounded-full px-2.5 py-0.5 bg-good-soft text-good">A</span>
          <span className="rounded-full px-2.5 py-0.5 bg-accent-soft text-accent-dark">B</span>
          <span className="rounded-full px-2.5 py-0.5 bg-warn-soft text-warn">C</span>
        </span>
      </div>

      {withCoords.length ? (
        <TerritoryMap
          parcels={withCoords}
          onAddToRoute={(id) => {
            if (!ws.route.includes(id)) {
              ws.addRouteStops([id]);
              toast(`Added to route (${ws.route.length + 1})`);
            }
          }}
        />
      ) : (
        <Callout tone="warn">
          No parcels have coordinates yet. County exports usually omit them, so click{' '}
          <b>Geocode addresses</b> above to look them up free via the US Census geocoder — it fills
          in lat/long and unlocks the map. Route building below already works without coordinates
          (opens in Google Maps by address).
        </Callout>
      )}

      <div className="mt-3">
        {!routeStops.length ? (
          <p className="text-[12.5px] text-ink3">
            Route is empty — add stops from Candidates, Portfolios, or map pins, then open it in
            Google Maps in optimized order.
          </p>
        ) : (
          <Card>
            <div className="flex items-center gap-2.5 flex-wrap mb-2">
              <p className="font-semibold text-[13px] flex items-center gap-1.5">
                <IconRoute />
                Canvassing route — {routeStops.length} stops, {formatMoney(routeTotal)}/yr on the
                line
              </p>
              <span className="ml-auto flex gap-2">
                <GhostLink href={mapsUrl} target="_blank" rel="noreferrer">
                  Open in Google Maps
                </GhostLink>
                <Ghost
                  onClick={() => {
                    ws.clearRoute();
                    toast('Route cleared');
                  }}
                >
                  <IconTrash />
                  Clear
                </Ghost>
              </span>
            </div>
            {routeStops.map((s, i) => (
              <div
                key={s.x.id}
                className="flex gap-2 text-[12.5px] py-1 border-b border-dashed border-line last:border-0 items-center"
              >
                <b className="w-5 text-ink3">{i + 1}</b>
                <span className="flex-1">
                  {s.x.row.address}
                  {s.x.row.city ? `, ${s.x.row.city}` : ''}
                </span>
                <span className="text-ink2 tabular-nums">
                  {formatMoney(s.x.est.annualQuarterly)}/yr
                </span>
                <Ghost onClick={() => ws.toggleRouteStop(s.x.id)}>
                  <IconTrash />
                </Ghost>
              </div>
            ))}
            <p className="text-[11px] text-ink3 mt-2">
              Stops auto-ordered nearest-neighbor from {ws.settings.homeBase || 'your home base'}
              {' '}(set it in Settings). Walk in with the one-pager: score, windows, price.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
