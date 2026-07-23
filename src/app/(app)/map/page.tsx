'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useWorkspace } from '@/components/workspace';
import { useToast } from '@/components/toast';
import { Callout, Card, Ghost, GhostLink } from '@/components/ui';
import { IconRoute, IconTrash } from '@/components/icons';
import { Loading } from '@/components/loading';
import { EmptyRedirect } from '@/components/empty-redirect';
import {
  coordOf,
  formatMoney,
  formatNum,
  googleMapsRouteUrl,
  orderStops,
} from '@/lib/scoring';

const TerritoryMap = dynamic(() => import('@/components/territory-map'), {
  ssr: false,
  loading: () => <div className="h-[440px] rounded-xl border border-line bg-soft" />,
});

export default function MapPage() {
  const ws = useWorkspace();
  const toast = useToast();

  const withCoords = useMemo(() => ws.scored.filter((x) => coordOf(x.input)), [ws.scored]);

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
          No coordinate columns were mapped on import. Re-import the county file and map
          Latitude/Longitude if the file has them. Route building below still works without
          coordinates (opens in Google Maps by address).
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
