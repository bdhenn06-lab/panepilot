'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWorkspace } from '@/components/workspace';
import { useToast } from '@/components/toast';
import { Button, Callout, Card, Ghost } from '@/components/ui';
import { BILLING_ENABLED, PLANS } from '@/lib/billing';
import { seatLimitLabel, type PlanId } from '@/lib/plans';

function BillingView() {
  const ws = useWorkspace();
  const toast = useToast();
  const params = useSearchParams();
  const [busy, setBusy] = useState('');

  const plan = (ws.org?.plan ?? 'trial') as PlanId;
  const isAdmin = ws.role === 'owner' || ws.role === 'admin';
  const checkoutResult = params.get('checkout');

  async function subscribe(planId: string) {
    setBusy(planId);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, orgId: ws.orgId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      window.location.assign(data.url);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Checkout failed');
      setBusy('');
    }
  }

  async function manageBilling() {
    setBusy('portal');
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: ws.orgId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      window.location.assign(data.url);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not open billing portal');
      setBusy('');
    }
  }

  return (
    <div>
      <p className="text-base font-semibold mb-1">Plan &amp; billing</p>
      <p className="text-[12.5px] text-ink2 mb-3">
        Current plan: <b className="capitalize">{plan}</b> ({seatLimitLabel(plan).toLowerCase()}).
        Seats are per company workspace.
      </p>

      {checkoutResult === 'success' && (
        <Callout tone="ok">Subscription active — your plan updates within a few seconds.</Callout>
      )}
      {checkoutResult === 'cancelled' && (
        <Callout tone="warn">Checkout cancelled — no charge was made.</Callout>
      )}

      <div className="grid sm:grid-cols-3 gap-3 mt-2">
        {PLANS.map((p) => {
          const current = plan === p.id;
          return (
            <Card key={p.id} className={current ? '!border-accent' : ''}>
              <p className="font-semibold">{p.name}</p>
              <p className="text-[26px] font-bold tabular-nums">
                ${p.priceMonthly}
                <span className="text-xs font-normal text-ink3">/mo</span>
              </p>
              <p className="text-xs text-ink2">{p.seats}</p>
              <p className="text-xs text-ink3 mt-1.5 mb-3">{p.blurb}</p>
              <Button
                className="w-full !h-9 !text-xs"
                disabled={!BILLING_ENABLED || !isAdmin || current || busy !== ''}
                onClick={() => void subscribe(p.id)}
              >
                {current ? 'Current plan' : BILLING_ENABLED ? `Choose ${p.name}` : 'Coming soon'}
              </Button>
            </Card>
          );
        })}
      </div>

      {BILLING_ENABLED && ws.org?.plan && ws.org.plan !== 'trial' && isAdmin && (
        <Ghost className="mt-3" disabled={busy !== ''} onClick={() => void manageBilling()}>
          Manage billing / cancel
        </Ghost>
      )}

      {!isAdmin && (
        <p className="text-[11px] text-ink3 mt-3">Only workspace owners/admins can change the plan.</p>
      )}
      {!BILLING_ENABLED && (
        <p className="text-[11px] text-ink3 mt-3">
          Billing is feature-flagged off (NEXT_PUBLIC_BILLING_ENABLED). Every workspace runs on a
          free trial until Stripe keys are added. See README → Activating Stripe.
        </p>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingView />
    </Suspense>
  );
}
