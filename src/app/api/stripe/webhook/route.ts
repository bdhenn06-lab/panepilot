import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/server';
import { customerIdOf, subscriptionPlan } from '@/lib/stripe/sync';
import { createAdminClient } from '@/lib/supabase/admin';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook not configured.' }, { status: 503 });
  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });
  let event: Stripe.Event;
  try { event = getStripe().webhooks.constructEvent(await request.text(), signature, secret); }
  catch { return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 }); }
  const relevant = ['checkout.session.completed', 'checkout.session.async_payment_succeeded',
    'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'];
  if (!relevant.includes(event.type)) return NextResponse.json({ received: true });
  try {
    const object = event.data.object as Stripe.Checkout.Session | Stripe.Subscription;
    const id = object.object === 'checkout.session'
      ? (typeof object.subscription === 'string' ? object.subscription : object.subscription?.id) : object.id;
    if (!id) throw new Error('Subscription missing');
    // Read current Stripe state rather than trusting stale delivery payloads.
    const sub = await getStripe().subscriptions.retrieve(id);
    const orgId = sub.metadata.org_id;
    if (!orgId) return NextResponse.json({ received: true });
    const { error } = await createAdminClient().rpc('apply_billing_event', {
      event_id: event.id, event_created: event.created, target_org: orgId,
      customer_id: customerIdOf(sub), subscription_id: sub.id, new_plan: subscriptionPlan(sub),
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe event could not be applied', event.id, error);
    return NextResponse.json({ error: 'Billing update failed; retry required.' }, { status: 500 });
  }
}
