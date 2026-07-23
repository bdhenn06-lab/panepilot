'use client';

import Link from 'next/link';
import { useWorkspace } from '@/components/workspace';
import { useToast } from '@/components/toast';
import { Button, Card, Ghost, Kpi } from '@/components/ui';
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
    <div>
      <div className="flex items-center gap-2.5 mb-3 flex-wrap">
        <p className="text-base font-semibold">Team territory</p>
        <Ghost
          onClick={() => {
            toast('Pulling latest…');
            void ws.refresh().then(() => toast('Synced'));
          }}
        >
          <IconRefresh />
          Refresh team activity
        </Ghost>
        {c.due > 0 && (
          <Link href="/follow-ups">
            <Ghost className="!text-bad !border-bad">
              <IconAlarm />
              {c.due} follow-ups due
            </Ghost>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3.5">
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

      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <p className="font-semibold text-[13px] mb-2.5">Acquisition funnel</p>
          {funnel.map(([label, n]) => (
            <div key={label} className="flex items-center gap-2.5 mb-2">
              <span className="text-xs w-[88px] text-ink2">{label}</span>
              <div className="score-bar">
                <i style={{ width: `${(n / mx) * 100}%` }} />
              </div>
              <b className="text-[12.5px] w-11 text-right tabular-nums">{formatNum(n)}</b>
            </div>
          ))}
        </Card>
        <Card>
          <p className="font-semibold text-[13px] mb-2">Next best actions</p>
          {nextBest.map((x) => (
            <div
              key={x.id}
              className="flex gap-2.5 items-center py-1.5 border-b border-dashed border-line last:border-0"
            >
              <span
                className={`inline-grid place-items-center w-6 h-6 rounded-lg font-bold text-[11px] shrink-0 ${
                  x.score.grade === 'A'
                    ? 'bg-good-soft text-good'
                    : x.score.grade === 'B'
                      ? 'bg-accent-soft text-accent-dark'
                      : x.score.grade === 'C'
                        ? 'bg-warn-soft text-warn'
                        : 'bg-soft text-ink3'
                }`}
              >
                {x.score.grade}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold truncate">{x.row.address}</p>
                <p className="text-[11px] text-ink3 truncate">
                  {formatMoney(x.est.annualQuarterly)}/yr · {x.row.owner_name || ''}
                </p>
              </div>
            </div>
          ))}
          <Link href="/candidates">
            <Ghost className="mt-2.5">Open candidates →</Ghost>
          </Link>
        </Card>
      </div>
    </div>
  );
}
