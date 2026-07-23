'use client';

import { useWorkspace } from '@/components/workspace';
import { useToast } from '@/components/toast';
import { Button, Card } from '@/components/ui';
import { BILLING_ENABLED, PLANS } from '@/lib/billing';

export default function BillingPage() {
  const ws = useWorkspace();
  const toast = useToast();

  return (
    <div>
      <p className="text-base font-semibold mb-1">Plan &amp; billing</p>
      <p className="text-[12.5px] text-ink2 mb-3">
        Current plan: <b className="capitalize">{ws.org?.plan ?? 'trial'}</b>. Seats are per
        company workspace.
      </p>
      <div className="grid sm:grid-cols-3 gap-3">
        {PLANS.map((p) => (
          <Card key={p.id} className={ws.org?.plan === p.id ? '!border-accent' : ''}>
            <p className="font-semibold">{p.name}</p>
            <p className="text-[26px] font-bold tabular-nums">
              ${p.priceMonthly}
              <span className="text-xs font-normal text-ink3">/mo</span>
            </p>
            <p className="text-xs text-ink2">{p.seats}</p>
            <p className="text-xs text-ink3 mt-1.5 mb-3">{p.blurb}</p>
            <Button
              className="w-full !h-9 !text-xs"
              disabled={!BILLING_ENABLED}
              onClick={() => toast('Checkout coming soon')}
            >
              {BILLING_ENABLED ? 'Choose ' + p.name : 'Coming soon'}
            </Button>
          </Card>
        ))}
      </div>
      {!BILLING_ENABLED && (
        <p className="text-[11px] text-ink3 mt-3">
          Billing is feature-flagged off (NEXT_PUBLIC_BILLING_ENABLED). Every workspace runs on a
          free trial until Stripe goes live.
        </p>
      )}
    </div>
  );
}
