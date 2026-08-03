'use client';

import { useMemo } from 'react';
import { useWorkspace, type ScoredParcel } from '@/components/workspace';
import { useToast } from '@/components/toast';
import { Card, Ghost, GradeBadge, PageHead } from '@/components/ui';
import { IconRoute } from '@/components/icons';
import { Loading } from '@/components/loading';
import { EmptyRedirect } from '@/components/empty-redirect';
import { formatMoney, formatNum, ownerKey } from '@/lib/scoring';

interface Group {
  name: string;
  items: ScoredParcel[];
  total: number;
}

export default function PortfoliosPage() {
  const ws = useWorkspace();
  const toast = useToast();

  const multi = useMemo(() => {
    const groups: Record<string, Group> = {};
    for (const x of ws.scored) {
      const k = ownerKey(x.row.owner_name);
      if (!k) continue;
      groups[k] = groups[k] ?? { name: x.row.owner_name ?? '', items: [], total: 0 };
      groups[k].items.push(x);
      groups[k].total += x.est.annualQuarterly;
    }
    return Object.values(groups)
      .filter((g) => g.items.length >= 2)
      .sort((a, b) => b.total - a.total);
  }, [ws.scored]);

  if (ws.loading) return <Loading />;
  if (!ws.parcels.length) return <EmptyRedirect />;

  return (
    <div className="max-w-[1240px]">
      <PageHead
        title="Portfolio owners"
        sub={
          <>
            <span className="num font-semibold text-ink">{formatNum(multi.length)}</span> owners
            hold 2+ {ws.settings.serviceMode === 'residential' ? 'residential' : 'commercial'}{' '}
            parcels, matched across LLC name variations. One relationship, many roofs.
          </>
        }
      />
      {multi.slice(0, 25).map((g) => (
        <Card key={g.name + g.items[0].id} className="mb-2">
          <div className="flex gap-2.5 items-center flex-wrap">
            <GradeBadge grade="A" label={`${g.items.length} bldgs`} />
            <div className="flex-1 min-w-[180px]">
              <p className="font-semibold text-[13.5px]">{g.name}</p>
              <p className="text-[11.5px] text-ink2">
                Portfolio potential: <b>{formatMoney(g.total)}/yr</b>
              </p>
            </div>
            <Ghost
              onClick={() => {
                ws.addRouteStops(g.items.map((x) => x.id));
                toast('Portfolio added to route');
              }}
            >
              <IconRoute />
              Route all
            </Ghost>
          </div>
          <div className="mt-1.5 text-xs text-ink2">
            {g.items.slice(0, 6).map((x) => (
              <div key={x.id}>
                · {x.row.address}
                {x.row.city ? `, ${x.row.city}` : ''} ({formatMoney(x.est.annualQuarterly)}/yr)
              </div>
            ))}
            {g.items.length > 6 && <div>· +{g.items.length - 6} more</div>}
          </div>
        </Card>
      ))}
    </div>
  );
}
