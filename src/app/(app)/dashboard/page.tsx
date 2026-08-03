'use client';

import Link from 'next/link';
import { useWorkspace } from '@/components/workspace';
import { useToast } from '@/components/toast';
import { Button, Card, Ghost, GradeBadge, Kpi, PageHead } from '@/components/ui';
import { IconAlarm, IconRefresh } from '@/components/icons';
import { formatMoney, formatNum, todayISO } from '@/lib/scoring';
import { Loading } from '@/components/loading';

export default function DashboardPage() {
  const ws = useWorkspace();
  const toast = useToast();

  if (ws.loading) return <Loading />;
  if (ws.loadError) return <p className="text-bad text-[13px]">{ws.loadError}</p>;

  if (!ws.parcels.length) {
    return (
      <div>
        <p className="text-base font-semibold mb-1.5">Workspace is empty</p>
        <p className="text-[13px] text-ink2 mb-3">
          Load your county&apos;s parcel file once and the whole team gets the scored territory.
        </p>
        <Link href="/import">
          <Button>Go to Data</Button>
        </Link>
      </div>
    );
  }

  const t = todayISO();
  const c = { fresh: 0, seq: 0, meet: 0, prop: 0, won: 0, wonV: 0, due: 0, pipeV: 0 };
  for (const x of ws.scored) {
    const s = ws.states[x.id];
    if (!s || !s.status) {
      c.fresh++;
      continue;
    }
    if (s.status === 'Won') {
      c.won++;
      c.wonV += x.est.annualQuarterly;
    } else if (s.status === 'Dead') {
      // out of funnel
    } else {
      if (s.status === 'Meeting') c.meet++;
      else if (s.status === 'Proposal') c.prop++;
      else c.seq++;
      c.pipeV += x.est.annualQuarterly;
      if (s.due && s.due <= t) c.due++;
    }
  }
  const gradeA = ws.scored.filter((x) => x.score.grade === 'A').length;
  const funnel: [string, number][] = [
    ['Untouched', c.fresh],
    ['In sequence', c.seq],
    ['Meetings', c.meet],
    ['Proposals', c.prop],
    ['Won', c.won],
  ];
  const mx = Math.max(1, ...funnel.map(([, n]) => n));
  const nextBest = ws.scored.filter((x) => !ws.states[x.id]?.status).slice(0, 5);

  return (
    <div className="max-w-[1240px]">
      <PageHead
        title="Team territory"
        sub="Statuses, notes, and sequence progress sync for the whole team."
      >
        <Ghost
          onClick={() => {
            toast('Pulling latest…');
            void ws.refresh().then(() => toast('Synced'));
          }}
        >
          <IconRefresh />
          Refresh
        </Ghost>
        {c.due > 0 && (
          <Link href="/follow-ups">
            <Ghost className="!text-bad !border-bad/40 !bg-bad-soft">
              <IconAlarm />
              {c.due} follow-ups due
            </Ghost>
          </Link>
        )}
      </PageHead>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi
          label={ws.settings.serviceMode === 'residential' ? 'Residential parcels' : 'Commercial parcels'}
          value={formatNum(ws.parcels.length)}
        />
        <Kpi label="A-grade targets" value={formatNum(gradeA)} hint="score 70+" />
        <Kpi label="Active pipeline" value={formatMoney(c.pipeV)} hint="/yr potential" />
        <Kpi
          label="Won"
          value={formatMoney(c.wonV)}
          hint={`/yr · ${c.won} contracts`}
          valueClass="text-good"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card>
          <p className="font-semibold text-[13px] mb-3">Acquisition funnel</p>
          {funnel.map(([label, n]) => (
            <div key={label} className="flex items-center gap-3 mb-2.5 last:mb-0">
              <span className="text-[12px] w-[92px] text-ink2 shrink-0">{label}</span>
              <div className="score-bar">
                <i style={{ width: `${(n / mx) * 100}%` }} />
              </div>
              <b className="num text-[12.5px] w-14 text-right">{formatNum(n)}</b>
            </div>
          ))}
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-[13px]">Next best actions</p>
            <Link
              href="/candidates"
              className="text-[12px] text-accent hover:text-accent-dark no-underline font-medium"
            >
              All candidates →
            </Link>
          </div>
          {nextBest.map((x) => (
            <Link
              key={x.id}
              href={`/candidates?focus=${x.id}`}
              className="flex gap-3 items-center py-2 border-b border-line last:border-0 no-underline text-ink -mx-1 px-1 rounded-lg hover:bg-soft transition-colors"
            >
              <GradeBadge grade={x.score.grade} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold truncate">{x.row.address}</p>
                <p className="text-[11px] text-ink3 truncate">{x.row.owner_name || 'Owner unknown'}</p>
              </div>
              <span className="num text-[12.5px] font-semibold shrink-0">
                {formatMoney(x.est.annualQuarterly)}
                <span className="text-[10.5px] font-normal text-ink3">/yr</span>
              </span>
            </Link>
          ))}
        </Card>
      </div>
    </div>
  );
}
