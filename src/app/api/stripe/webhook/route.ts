import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/server';
import { planForPriceId } from '@/lib/stripe/plans';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/**
 * Stripe webhook — the source of truth for an org's plan. Verifies the
 * signature, then syncs subscription lifecycle events onto the orgs row using
 * the service-role client (RLS-bypassing, justified because the Stripe
 * signature authenticates the caller). Configure the endpoint in Stripe to
 * send checkout.session.completed and customer.subscription.* events.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 503 });
  }
  const sig = request.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return NextResponse.json(
      { error: `Signature verification failed: ${e instanceof Error ? e.message : 'unknown'}` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  async function setOrgPlan(
    orgId: string,
    fields: { plan?: string; stripe_customer_id?: string | null; stripe_subscription_id?: string | null },
  ) {
    await admin.from('orgs').update(fields).eq('id', orgId);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const orgId = s.client_reference_id || s.metadata?.org_id;
        if (orgId) {
          await setOrgPlan(orgId, {
            plan: s.metadata?.plan,
            stripe_customer_id: typeof s.customer === 'string' ? s.customer : null,
            stripe_subscription_id: typeof s.subscription === 'string' ? s.subscription : null,
          });
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.org_id;
        const priceId = sub.items.data[0]?.price.id;
        const plan = priceId ? planForPriceId(priceId) : null;
        if (orgId) {
          // A canceled/unpaid subscription drops the org back to trial.
          const active = sub.status === 'active' || sub.status === 'trialing';
          await setOrgPlan(orgId, {
            plan: active && plan ? plan : 'trial',
            stripe_subscription_id: sub.id,
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.org_id;
        if (orgId) {
          await setOrgPlan(orgId, { plan: 'trial', stripe_subscription_id: null });
        }
        break;
      }
      default:
        // Ignore other event types.
        break;
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Handler error: ${e instanceof Error ? e.message : 'unknown'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
