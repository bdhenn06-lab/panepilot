'use client';

import { useMemo } from 'react';

import { useWorkspace, type ScoredParcel } from '@/components/workspace';
import { useToast } from '@/components/toast';
import { Button, Callout, Ghost, GhostLink, ScoreBar } from '@/components/ui';
import { IconCheck, IconFile, IconMail, IconMap, IconPhone, IconRoute } from '@/components/icons';
import {
  MAX_TOUCHES,
  STATUSES,
  TOUCHES,
  callScript,
  formatMoney,
  googleMapsSearchUrl,
  nearbyTargets,
  portfolioChain,
  touchEmail,
} from '@/lib/scoring';

/** How far the crew will realistically detour while already on site. */
const NEARBY_RADIUS_MILES = 2;

/** Confidence is only useful if a low one actually looks different. */
const CONFIDENCE_TONE: Record<string, string> = {
  high: 'text-good',
  medium: 'text-ink2',
  low: 'text-warn',
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ProspectDetail({ x }: { x: ScoredParcel }) {
  const ws = useWorkspace();
  const toast = useToast();
  const s = ws.stateOf(x.id);
  // Only computed once the deal is actually won — that's the moment the rest of
  // the landlord's portfolio is worth putting in front of the operator.
  const chain = useMemo(
    () =>
      s.status === 'Won'
        ? portfolioChain(
            x.id,
            ws.scored.map((p) => ({
              id: p.id,
              address: p.row.address,
              ownerName: p.row.owner_name,
              annualValue: p.est.annualQuarterly,
            })),
          )
        : null,
    [s.status, x.id, ws.scored],
  );
  // Worth knocking on while the crew is already at this address.
  const nearby = useMemo(
    () =>
      nearbyTargets(
        x.id,
        ws.scored.map((p) => ({
          id: p.id,
          lat: p.row.lat,
          lon: p.row.lon,
          annualValue: p.est.annualQuarterly,
          address: p.row.address,
        })),
        NEARBY_RADIUS_MILES,
      ).slice(0, 4),
    [x.id, ws.scored],
  );
  const email = touchEmail(x.input, x.est, Math.min(s.touch, MAX_TOUCHES - 1), ws.settings);
  const touchIdx = Math.min(s.touch, MAX_TOUCHES - 1);

  return (
    <div className="grid sm:grid-cols-2 gap-3.5">
      <div>
        <div className="bg-soft rounded-lg p-3 mb-3">
          <p className="text-[15px] font-semibold leading-tight">
            {formatMoney(x.thesis.priceLow)}–{formatMoney(x.thesis.priceHigh)}{' '}
            <span className="text-[11.5px] font-normal text-ink2">first clean</span>
          </p>
          <p className="text-[12.5px] text-ink2 mt-0.5">
            <b>{formatMoney(x.thesis.annualValue)}/yr</b> on the quarterly plan ·{' '}
            {x.thesis.crewNote}
          </p>
          <p className="text-[12.5px] mt-1.5">{x.thesis.headline}</p>
          <p className="text-[10.5px] text-ink3 mt-1.5" title={x.thesis.confidenceWhy}>
            <b className={CONFIDENCE_TONE[x.thesis.confidence]}>
              {x.thesis.confidence.toUpperCase()} CONFIDENCE
            </b>{' '}
            · {x.thesis.confidenceWhy}
          </p>
        </div>
        <p className="text-[11px] font-semibold text-ink3 mb-1.5">WHY THIS SCORE</p>
        {x.score.parts.map((p) =>
          // A zero-weight factor is one this county can't differentiate on, so
          // its weight moved to the signals that can. Showing "0 / 0" with an
          // empty bar reads as a broken score rather than a missing input.
          p.max === 0 ? (
            <div key={p.label} className="mb-1.5 flex justify-between text-xs text-ink3">
              <span>{p.label}</span>
              <span className="text-[10.5px]">not published for this county</span>
            </div>
          ) : (
            <div key={p.label} className="mb-1.5">
              <div className="flex justify-between text-xs">
                <span>{p.label}</span>
                <b className="tabular-nums">
                  {p.points} / {p.max}
                </b>
              </div>
              <ScoreBar pct={(p.points / p.max) * 100} className="my-0.5" />
              <p className="text-[10.5px] text-ink3">{p.why}</p>
            </div>
          ),
        )}
        {nearby.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-ink3 mt-2.5 mb-1">
              WHILE YOU&rsquo;RE THERE — WITHIN {NEARBY_RADIUS_MILES} MILES
            </p>
            {nearby.map((n) => (
              <div key={n.id} className="flex justify-between text-[11.5px] text-ink2">
                <span className="truncate pr-2">{n.address}</span>
                <span className="tabular-nums whitespace-nowrap">
                  {formatMoney(n.annualValue)}/yr · {n.miles.toFixed(1)} mi
                </span>
              </div>
            ))}
            <Ghost
              onClick={() => {
                ws.addRouteStops([x.id, ...nearby.map((n) => n.id)]);
                toast(`${nearby.length + 1} stops added to route`);
              }}
            >
              <IconRoute />
              Route this cluster
            </Ghost>
          </>
        )}
        <p className="text-[11px] font-semibold text-ink3 mt-2.5 mb-1">TEAM NOTES</p>
        <textarea
          className="w-full min-h-[52px] border border-line2 rounded-md p-2 text-xs outline-none focus:border-accent"
          placeholder="Gatekeeper name, best time to call…"
          defaultValue={s.notes}
          onBlur={(e) => {
            if (e.target.value !== s.notes) ws.setState(x.id, { notes: e.target.value });
          }}
        />
      </div>
      <div>
        <p className="text-[11px] font-semibold text-ink3 mb-1.5">
          TOUCH {Math.min(s.touch + 1, MAX_TOUCHES)}/{MAX_TOUCHES}:{' '}
          {TOUCHES[touchIdx].name.toUpperCase()}
        </p>
        <div className="flex gap-1.5 flex-wrap mb-2">
          <Ghost
            onClick={() =>
              void copyText(`Subject: ${email.subject}\n\n${email.body}`).then((ok) =>
                toast(ok ? 'Email copied' : 'Copy failed — select the text below'),
              )
            }
          >
            <IconMail />
            Copy email
          </Ghost>
          <GhostLink
            href={`mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}
            title="Opens your mail app with the touch pre-filled — add the recipient"
          >
            <IconMail />
            Mail app
          </GhostLink>
          <Ghost
            onClick={() =>
              void copyText(callScript(x.input, x.est, ws.settings)).then((ok) =>
                toast(ok ? 'Call script copied' : 'Copy failed'),
              )
            }
          >
            <IconPhone />
            Call script
          </Ghost>
          <GhostLink href={`/proposal/${x.id}`} target="_blank">
            <IconFile />
            Proposal
          </GhostLink>
          <GhostLink href={googleMapsSearchUrl(x.input, ws.settings)} target="_blank" rel="noreferrer">
            <IconMap />
            Satellite
          </GhostLink>
          <Button
            className="!h-8 !text-xs"
            onClick={() => {
              const r = ws.markSent(x.id);
              toast(
                r
                  ? `Touch ${r.touch} logged${r.due ? ` — next due ${r.due}` : ' — sequence complete'}`
                  : 'Sequence complete',
              );
            }}
          >
            <IconCheck />
            Mark sent
          </Button>
        </div>
        <label className="text-xs text-ink2 flex items-center gap-1.5">
          Status:
          <select
            className="h-[30px] border border-line2 rounded-md text-xs bg-panel px-1.5"
            value={s.status}
            onChange={(e) => {
              const status = e.target.value as (typeof STATUSES)[number];
              ws.setState(x.id, {
                status,
                ...(status === 'Won' || status === 'Dead' ? { due: '' } : {}),
              });
            }}
          >
            {STATUSES.map((st) => (
              <option key={st} value={st}>
                {st === '' ? 'Untouched' : st}
              </option>
            ))}
          </select>
        </label>
        {s.status === 'Won' && chain && (
          <Callout tone="ok">
            <b>
              {chain.ownerName} owns {chain.siblings.length} more{' '}
              {chain.siblings.length === 1 ? 'property' : 'properties'} here —{' '}
              {formatMoney(chain.remainingAnnual)}/yr still open.
            </b>
            <div className="mt-1 text-[11.5px]">
              {chain.siblings.slice(0, 4).map((sib) => (
                <div key={sib.id}>
                  · {sib.address} ({formatMoney(sib.annualValue)}/yr)
                </div>
              ))}
              {chain.siblings.length > 4 && <div>· +{chain.siblings.length - 4} more</div>}
            </div>
            <Ghost
              onClick={() => {
                ws.addRouteStops(chain.siblings.map((sib) => sib.id));
                toast(`${chain.siblings.length} added to route`);
              }}
            >
              <IconRoute />
              Route the rest
            </Ghost>
          </Callout>
        )}
        <div className="bg-soft rounded-lg p-3 text-xs whitespace-pre-wrap leading-relaxed mt-2 max-h-40 overflow-y-auto">
          <b>{email.subject}</b>
          {'\n\n'}
          {email.body}
        </div>
      </div>
    </div>
  );
}
