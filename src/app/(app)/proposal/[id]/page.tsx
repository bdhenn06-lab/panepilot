'use client';

import { use } from 'react';
import { useWorkspace } from '@/components/workspace';
import { Loading } from '@/components/loading';
import { Ghost } from '@/components/ui';
import { formatMoney, formatNum, fullAddress, todayISO } from '@/lib/scoring';

/**
 * Printable branded proposal. Renders as a clean document; the Print button
 * (hidden in print) opens the browser dialog — print to PDF or paper.
 */
export default function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ws = useWorkspace();

  if (ws.loading) return <Loading />;
  const x = ws.byId.get(Number(id));
  if (!x) return <p className="text-[13px] text-bad">Prospect not found.</p>;

  const s = ws.settings;
  const e = x.est;
  const isResidential = s.serviceMode === 'residential';

  return (
    <div className="max-w-[640px] mx-auto font-serif leading-relaxed text-[#1a1a1a]">
      <div className="no-print mb-4 flex gap-2">
        <Ghost onClick={() => window.print()}>Print / save PDF</Ghost>
        <Ghost onClick={() => history.back()}>Back</Ghost>
      </div>

      <div className="flex justify-between items-baseline">
        <h1 className="text-[22px] font-bold border-b-[3px] border-accent pb-2 flex-1">
          {s.companyName}
        </h1>
        <span className="text-xs text-[#666] ml-4">{todayISO()}</span>
      </div>
      <p className="text-xs text-[#666] mt-1">
        {isResidential ? 'Window cleaning proposal' : 'Exterior window cleaning proposal'} · Prepared
        for {x.row.owner_name || 'Property Owner'}
      </p>

      <h2 className="text-[15px] font-bold mt-6">Property</h2>
      <p className="text-[13.5px]">
        <b>{fullAddress(x.input, s)}</b>
        <br />
        {e.stories} {e.stories === 1 ? 'story' : 'stories'} · {formatNum(e.bldgSqft)} sq ft (county
        record) · est. {formatNum(e.windows)} windows
        {isResidential ? '' : ` / ${formatNum(e.glassSqft)} sq ft exterior glass`}
      </p>

      <h2 className="text-[15px] font-bold mt-6">Service options</h2>
      <table className="w-full border-collapse my-3 text-[13px]">
        <thead>
          <tr>
            {['Plan', 'Frequency', 'Per clean', 'Annual'].map((h) => (
              <th key={h} className="border border-[#ccc] px-2.5 py-2 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-[#ccc] px-2.5 py-2">One-time</td>
            <td className="border border-[#ccc] px-2.5 py-2">Single visit</td>
            <td className="border border-[#ccc] px-2.5 py-2">{formatMoney(e.pricePerClean)}</td>
            <td className="border border-[#ccc] px-2.5 py-2">—</td>
          </tr>
          <tr>
            <td className="border border-[#ccc] px-2.5 py-2">
              <b>Quarterly</b> (recommended)
            </td>
            <td className="border border-[#ccc] px-2.5 py-2">4x / year</td>
            <td className="border border-[#ccc] px-2.5 py-2">
              {formatMoney(e.pricePerClean * (1 - s.quarterlyDiscountPct / 100))}
            </td>
            <td className="border border-[#ccc] px-2.5 py-2">
              <b>{formatMoney(e.annualQuarterly)}</b>
            </td>
          </tr>
          <tr>
            <td className="border border-[#ccc] px-2.5 py-2">Monthly</td>
            <td className="border border-[#ccc] px-2.5 py-2">12x / year</td>
            <td className="border border-[#ccc] px-2.5 py-2">
              {formatMoney(e.pricePerClean * (1 - s.monthlyDiscountPct / 100))}
            </td>
            <td className="border border-[#ccc] px-2.5 py-2">{formatMoney(e.annualMonthly)}</td>
          </tr>
        </tbody>
      </table>

      <p className="text-[26px] font-bold text-accent-dark">{formatMoney(e.annualQuarterly)} / year</p>
      <p className="text-xs text-[#666]">
        {isResidential
          ? `Fully insured. Pricing derived from public county property records and confirmed at the visit; if the window count differs, we adjust the number, not the quality.`
          : `Quarterly plan. Crew, lift equipment, and insurance included. Pricing derived from official county building records and confirmed at first service; if actual glass differs materially, we adjust the number, not the quality.`}
      </p>

      <h2 className="text-[15px] font-bold mt-6">Terms</h2>
      <p className="text-[13px]">
        No long-term lock-in — cancel with 30 days notice. Fully insured.{' '}
        {isResidential
          ? 'Scheduling works around your day.'
          : 'Scheduling works around your tenants and hours.'}
      </p>

      <p className="mt-6 text-[13.5px]">
        {s.contactName}
        <br />
        {s.companyName}
        <br />
        {s.contactPhone}
        {s.contactEmail ? (
          <>
            <br />
            {s.contactEmail}
          </>
        ) : null}
      </p>
    </div>
  );
}
