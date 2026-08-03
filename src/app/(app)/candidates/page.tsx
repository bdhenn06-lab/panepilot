'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWorkspace, type ScoredParcel } from '@/components/workspace';
import { useToast } from '@/components/toast';
import { Card, Ghost, GradeBadge, Input, PageHead, ScoreBar } from '@/components/ui';
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

  const selectClass =
    'h-9 border border-line2 rounded-lg text-[12.5px] bg-panel px-2 text-ink2 cursor-pointer hover:border-ink3 transition-colors';

  return (
    <div className="max-w-[1240px]">
      <PageHead
        title="Candidates"
        sub={
          <>
            <span className="num font-semibold text-ink">{formatNum(view.length)}</span> matches
            {view.length > SHOW ? ` · showing top ${SHOW}` : ''}
            {ws.deadSignals.length > 0 && (
              <>
                {' · '}
                <span
                  className="text-warn"
                  title={`This county publishes nothing that separates buildings on ${ws.deadSignals.join(', ').toLowerCase()}, so the remaining signals carry the full score.`}
                >
                  graded on {5 - ws.deadSignals.length} of 5 signals
                </span>
              </>
            )}
          </>
        }
      >
        <Ghost onClick={exportCsv}>Export view</Ghost>
      </PageHead>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Input
          className="!h-9 max-w-[280px] !text-[12.5px]"
          placeholder="Search address, owner, or city"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={selectClass} value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">All grades</option>
          {['A', 'B', 'C', 'D'].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          <option value="none">Untouched</option>
          {['Sequencing', 'Meeting', 'Proposal', 'Won', 'Dead'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      {view.slice(0, SHOW).map((x: ScoredParcel) => {
        const s = ws.states[x.id];
        const inRoute = ws.route.includes(x.id);
        const isOpen = open === x.id;
        return (
          <Card
            key={x.id}
            className={`mb-1.5 !py-0 !px-0 overflow-hidden transition-colors ${
              isOpen ? 'border-accent/40' : 'hover:border-line2'
            }`}
          >
            <div
              className="flex gap-3 items-center cursor-pointer px-3.5 py-3"
              onClick={() => setOpen(isOpen ? null : x.id)}
            >
              <GradeBadge grade={x.score.grade} />

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[13.5px] truncate">
                  {x.row.address}
                  {x.row.city ? (
                    <span className="font-normal text-ink3">, {x.row.city}</span>
                  ) : null}
                </p>
                <p className="text-[11.5px] text-ink3 truncate">
                  {x.row.owner_name || 'Owner unknown'}
                  {s?.status ? (
                    <>
                      {' · '}
                      <b className="text-ink2">
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
                <p className="text-[11px] text-ink3 truncate mt-0.5 max-sm:hidden">
                  {x.thesis.headline}
                </p>
                {/* Phone layout has no room for the right-hand column, but the
                    price is the whole point — inline it rather than drop it. */}
                <p className="num text-[12px] font-semibold mt-0.5 sm:hidden">
                  {formatMoney(x.thesis.priceLow)}–{formatMoney(x.thesis.priceHigh)}
                  <span className="text-[10px] font-normal text-ink3"> first clean</span>
                </p>
              </div>

              {/* Money first — it's what the operator is actually deciding on. */}
              <div className="text-right shrink-0 max-sm:hidden">
                <p className="num text-[14px] font-semibold leading-tight">
                  {formatMoney(x.thesis.priceLow)}–{formatMoney(x.thesis.priceHigh)}
                </p>
                <p className="text-[10.5px] text-ink3">
                  first clean · <span className="num">{formatMoney(x.est.annualQuarterly)}</span>/yr
                </p>
              </div>

              <div className="flex items-center gap-2 w-[92px] shrink-0 max-lg:hidden">
                <ScoreBar pct={x.score.total} />
                <b className="num text-[12.5px] w-[22px] text-right">{x.score.total}</b>
              </div>

              <Ghost
                className={`shrink-0 ${inRoute ? '!bg-accent-soft !text-accent-dark !border-accent' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  ws.toggleRouteStop(x.id);
                  toast(inRoute ? 'Removed from route' : `Added to route (${ws.route.length + 1})`);
                }}
              >
                <IconRoute />
                <span className="max-sm:hidden">{inRoute ? 'In route' : 'Route'}</span>
              </Ghost>
              <IconChevronDown
                className={`text-ink3 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
              />
            </div>
            {isOpen && (
              <div className="border-t border-line bg-soft px-3.5 py-3.5">
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
