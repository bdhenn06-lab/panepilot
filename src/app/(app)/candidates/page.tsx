'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWorkspace, type ScoredParcel } from '@/components/workspace';
import { useToast } from '@/components/toast';
import { Card, Ghost, GradeBadge, Input, ScoreBar } from '@/components/ui';
import { IconChevronDown, IconRoute } from '@/components/icons';
import { Loading } from '@/components/loading';
import { ProspectDetail } from '@/components/prospect-detail';
import { formatMoney, formatNum, todayISO } from '@/lib/scoring';
import { EmptyRedirect } from '@/components/empty-redirect';

const SHOW = 40;

function CandidatesView() {
  const ws = useWorkspace();
  const toast = useToast();
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [grade, setGrade] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<number | null>(() => {
    const o = params.get('open');
    return o ? Number(o) : null;
  });

  const view = useMemo(() => {
    const f = search.toLowerCase();
    return ws.scored.filter((x) => {
      const s = ws.states[x.id];
      if (grade && x.score.grade !== grade) return false;
      if (status === 'none' && s?.status) return false;
      if (status && status !== 'none' && s?.status !== status) return false;
      if (
        f &&
        !`${x.row.address ?? ''} ${x.row.owner_name ?? ''} ${x.row.city ?? ''}`
          .toLowerCase()
          .includes(f)
      )
        return false;
      return true;
    });
  }, [ws.scored, ws.states, search, grade, status]);

  if (ws.loading) return <Loading />;
  if (!ws.parcels.length) return <EmptyRedirect />;

  const t = todayISO();

  function exportCsv() {
    const header = [
      'Score', 'Grade', 'Address', 'City', 'ZIP', 'Owner', 'Mailing',
      'EstWindows', 'PerClean', 'QuarterlyYr', 'Status', 'Touch', 'NextDue', 'Notes',
    ];
    const clean = (v: unknown) => String(v ?? '').replace(/[,\n]/g, ';');
    const rows = view.slice(0, 2000).map((x) => {
      const s = ws.states[x.id];
      return [
        x.score.total, x.score.grade, clean(x.row.address), clean(x.row.city),
        String(x.row.zip ?? '').slice(0, 5), clean(x.row.owner_name), clean(x.row.owner_mailing),
        x.est.windows, x.est.pricePerClean, Math.round(x.est.annualQuarterly),
        s?.status ?? '', s?.touch ?? 0, s?.due ?? '', clean(s?.notes),
      ];
    });
    const blob = new Blob([[header, ...rows].map((r) => r.join(',')).join('\n')], {
      type: 'text/csv',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'panepilot-candidates.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <p className="text-base font-semibold">Candidates</p>
        <select
          className="h-[34px] border border-line2 rounded-md text-xs bg-panel px-1.5"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        >
          <option value="">All grades</option>
          {['A', 'B', 'C', 'D'].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select
          className="h-[34px] border border-line2 rounded-md text-xs bg-panel px-1.5"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Any status</option>
          <option value="none">Untouched</option>
          {['Sequencing', 'Meeting', 'Proposal', 'Won', 'Dead'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <Input
          className="!h-[34px] max-w-[220px] !text-[12.5px]"
          placeholder="Search address / owner / city"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="ml-auto">
          <Ghost onClick={exportCsv}>Export view</Ghost>
        </span>
      </div>

      <p className="text-[11.5px] text-ink3 mb-2">
        {formatNum(view.length)} matches{view.length > SHOW ? ` · showing top ${SHOW}` : ''}
      </p>

      {view.slice(0, SHOW).map((x: ScoredParcel) => {
        const s = ws.states[x.id];
        const inRoute = ws.route.includes(x.id);
        const isOpen = open === x.id;
        return (
          <Card key={x.id} className="mb-2 !py-3">
            <div
              className="flex gap-2.5 items-center flex-wrap cursor-pointer"
              onClick={() => setOpen(isOpen ? null : x.id)}
            >
              <GradeBadge grade={x.score.grade} />
              <div className="flex-1 min-w-[180px]">
                <p className="font-semibold text-[13.5px]">
                  {x.row.address}
                  {x.row.city ? `, ${x.row.city}` : ''}
                </p>
                <p className="text-[11.5px] text-ink2">
                  {x.row.owner_name || 'owner unknown'} · ~{formatNum(x.est.windows)} win ·{' '}
                  {formatMoney(x.est.annualQuarterly)}/yr
                  {s?.status ? (
                    <>
                      {' · '}
                      <b>
                        {s.status}
                        {s.touch ? ` (touch ${s.touch}/5)` : ''}
                      </b>
                    </>
                  ) : null}
                  {s?.due && s.due <= t ? (
                    <>
                      {' · '}
                      <span className="text-bad font-semibold">due</span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-2 min-w-[110px]">
                <ScoreBar pct={x.score.total} />
                <b className="text-[12.5px] tabular-nums">{x.score.total}</b>
              </div>
              <Ghost
                className={inRoute ? '!bg-accent-soft !text-accent-dark !border-accent' : ''}
                onClick={(e) => {
                  e.stopPropagation();
                  ws.toggleRouteStop(x.id);
                  toast(inRoute ? 'Removed from route' : `Added to route (${ws.route.length + 1})`);
                }}
              >
                <IconRoute />
                {inRoute ? 'In route' : 'Route'}
              </Ghost>
              <IconChevronDown
                className={`text-ink3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </div>
            {isOpen && (
              <div className="mt-3 border-t border-dashed border-line pt-3">
                <ProspectDetail x={x} />
              </div>
            )}
          </Card>
        );
      })}
      {!view.length && <p className="text-[13px] text-ink3">No matches.</p>}
    </div>
  );
}

export default function CandidatesPage() {
  return (
    <Suspense>
      <CandidatesView />
    </Suspense>
  );
}
