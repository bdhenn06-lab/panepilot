'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { ScoredParcel } from '@/components/workspace';
import { coordOf, formatMoney, type Grade } from '@/lib/scoring';

const GRADE_COLORS: Record<Grade, string> = {
  A: '#0f9d58',
  B: '#2a78d6',
  C: '#b45309',
  D: '#8a8983',
};

const MAX_MARKERS = 600;

/**
 * Leaflet territory map with grade-colored markers.
 * Client-only (imported with next/dynamic, ssr: false).
 */
export default function TerritoryMap({
  parcels,
  onAddToRoute,
}: {
  parcels: ScoredParcel[];
  onAddToRoute: (id: number) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const addRef = useRef(onAddToRoute);

  useEffect(() => {
    addRef.current = onAddToRoute;
  }, [onAddToRoute]);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current);
    mapRef.current = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const pts: [number, number][] = [];
    for (const x of parcels.slice(0, MAX_MARKERS)) {
      const c = coordOf(x.input);
      if (!c) continue;
      pts.push(c);
      const col = GRADE_COLORS[x.score.grade];
      const marker = L.circleMarker(c, {
        radius: x.score.grade === 'A' ? 8 : 6,
        color: col,
        fillColor: col,
        fillOpacity: 0.75,
        weight: 1,
      }).addTo(map);

      const div = document.createElement('div');
      div.innerHTML =
        `<b>${escapeHtml(x.row.address)}</b><br>` +
        `${escapeHtml(x.row.owner_name ?? '')}<br>` +
        `Score ${x.score.total} (${x.score.grade}) · ${formatMoney(x.est.annualQuarterly)}/yr<br>`;
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = '+ Add to route';
      a.onclick = (e) => {
        e.preventDefault();
        addRef.current(x.id);
      };
      div.appendChild(a);
      marker.bindPopup(div);
    }
    if (pts.length) map.fitBounds(pts, { padding: [24, 24] });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Parcels identity changes only on reload/settings change; rebuilding the
    // whole layer then is fine.
  }, [parcels]);

  return <div ref={divRef} className="h-[440px] rounded-xl border border-line z-0" />;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
