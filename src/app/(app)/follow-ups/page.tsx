'use client';

import { useRouter } from 'next/navigation';
import { useWorkspace, type ScoredParcel } from '@/components/workspace';
import { useToast } from '@/components/toast';
import { Card, Ghost } from '@/components/ui';
import { IconCheck } from '@/components/icons';
import { Loading } from '@/components/loading';
import { EmptyRedirect } from '@/components/empty-redirect';
import { formatMoney, todayISO } from '@/lib/scoring';

export default function FollowUpsPage() {
  const ws = useWorkspace();
  const toast = useToast();
  const router = useRouter();

  if (ws.loading) return <Loading />;
  if (!ws.parcels.length) return <EmptyRedirect />;

  const t = todayISO();
  const due: ScoredParcel[] = [];
  const upcoming: ScoredParcel[] = [];
  for (const x of ws.scored) {
    const s = ws.states[x.id];
    if (!s?.due) continue;
    if (['Won', 'Dead', 'Meeting', 'Proposal'].includes(s.status)) continue;
    (s.due <= t ? due : upcoming).push(x);
  }
  upcoming.sort((a, b) => (ws.states[a.id].due < ws.states[b.id].due ? -1 : 1));
  const fresh = ws.scored.filter((x) => !ws.states[x.id]?.status).slice(0, 10);

  function row(x: ScoredParcel, showDue: boolean) {
    const s = ws.states[x.id];
    return (
      <tr key={x.id} className="hover:bg-soft">
        <td className="py-2 px-2 border-b border-line">
          <span
            className={`inline-grid place-items-center w-6 h-6 rounded-md font-bold text-[11px] ${
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
        </td>
        <td className="py-2 px-2 border-b border-line text-[12.5px]">
          {x.row.address}
          {x.row.city ? `, ${x.row.city}` : ''}
          <br />
          <span className="text-[11px] text-ink3">{x.row.owner_name || ''}</span>
        </td>
        <td className="py-2 px-2 border-b border-line text-[12.5px]">
          {s?.touch ? `Touch ${s.touch}/5` : '—'}
          {showDue && s?.due ? (
            <>
              <br />
              <span
                className={`text-[11px] ${s.due <= t ? 'text-bad font-semibold' : 'text-ink3'}`}
              >
                {s.due <= t ? 'DUE' : `due ${s.due}`}
              </span>
            </>
          ) : null}
        </td>
        <td className="py-2 px-2 border-b border-line font-semibold text-[12.5px] tabular-nums">
          {formatMoney(x.est.annualQuarterly)}
        </td>
        <td className="py-2 px-2 border-b border-line whitespace-nowrap">
          <Ghost onClick={() => router.push(`/candidates?open=${x.id}`)}>Open</Ghost>{' '}
          <Ghost
            onClick={() => {
              const r = ws.markSent(x.id);
              toast(r ? `Touch ${r.touch} logged` : 'Sequence complete');
            }}
          >
            <IconCheck />
            Sent
          </Ghost>
        </td>
      </tr>
    );
  }

  const head = (
    <tr>
      {['', 'Property', 'Sequence', 'Est/yr', ''].map((h, i) => (
        <th
          key={i}
          className="text-left text-[10.5px] font-semibold text-ink3 uppercase py-1.5 px-2 border-b border-line whitespace-nowrap"
        >
          {h}
        </th>
      ))}
    </tr>
  );

  return (
    <div>
      <p className="text-base font-semibold mb-1">Follow-up engine</p>
      <p className="text-[12.5px] text-ink2 mb-3">
        Shared across the team — anyone can work the queue and everyone sees it. Cadence: days 1,
        3, 6, 10, 14. Deals die from silence, not rejection — this tab is the fix.
      </p>

      <Card className="mb-3 !px-3 !py-1.5">
        <p className={`font-semibold text-[13px] py-2 ${due.length ? 'text-bad' : ''}`}>
          {due.length ? `${due.length} due now` : 'Nothing due — all caught up'}
        </p>
        {due.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>{head}</thead>
              <tbody>{due.map((x) => row(x, true))}</tbody>
            </table>
          </div>
        )}
      </Card>

      {upcoming.length > 0 && (
        <Card className="mb-3 !px-3 !py-1.5">
          <p className="font-semibold text-[13px] py-2">Coming up</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>{head}</thead>
              <tbody>{upcoming.slice(0, 8).map((x) => row(x, true))}</tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="!px-3 !py-1.5">
        <p className="font-semibold text-[13px] py-2">Start today — top untouched</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>{head}</thead>
            <tbody>{fresh.map((x) => row(x, false))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
