import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { priceIdForPlan, stripeConfigured } from '@/lib/stripe/plans';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_BILLING_ENABLED !== 'true' || !stripeConfigured()) {
    return NextResponse.json({ error: 'Billing is not enabled yet.' }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  let body: { plan?: string; orgId?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const { plan, orgId } = body;
  if (typeof orgId !== 'string' || typeof plan !== 'string' || !priceIdForPlan(plan)) {
    return NextResponse.json({ error: 'Invalid workspace or plan.' }, { status: 400 });
  }
  const { data: membership } = await supabase.from('org_members').select('role')
    .eq('org_id', orgId).eq('user_id', user.id).maybeSingle();
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  const admin = createAdminClient();
  const { data: token, error: lockError } = await admin.rpc('claim_billing_checkout', { target_org: orgId });
  if (lockError) return NextResponse.json({ error: 'Billing temporarily unavailable.' }, { status: 503 });
  if (!token) return NextResponse.json({ error: 'Another checkout is being prepared. Try again shortly.' }, { status: 409 });
  let sessionId: string | undefined;
  try {
    const stripe = getStripe();
    const { data: org, error } = await admin.from('orgs').select('stripe_customer_id').eq('id', orgId).single();
    if (error) throw new Error(error.message);
    let customer = org.stripe_customer_id;
    if (!customer) {
      const created = await stripe.customers.create({ email: user.email, metadata: { org_id: orgId } },
        { idempotencyKey: `panepilot-customer-${orgId}` });
      customer = created.id;
      const { error: saveError } = await admin.from('orgs').update({ stripe_customer_id: customer }).eq('id', orgId);
      if (saveError) throw new Error(saveError.message);
    }
    const origin = process.env.APP_URL || new URL(request.url).origin;
    const subscriptions = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 });
    if (subscriptions.data.some((sub) => !['canceled', 'incomplete_expired'].includes(sub.status))) {
      const portal = await stripe.billingPortal.sessions.create({ customer, return_url: `${origin}/billing` });
      return NextResponse.json({ url: portal.url });
    }
    const { data: operation, error: operationError } = await admin.from('billing_operations')
      .select('checkout_session_id').eq('org_id', orgId).single();
    if (operationError) throw new Error(operationError.message);
    if (operation.checkout_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(operation.checkout_session_id);
      if (existing.status === 'open' && existing.metadata?.plan === plan && existing.url) {
        return NextResponse.json({ url: existing.url });
      }
      if (existing.status === 'open') await stripe.checkout.sessions.expire(existing.id);
      if (existing.status === 'complete') {
        const subscriptionId = typeof existing.subscription === 'string' ? existing.subscription : existing.subscription?.id;
        if (subscriptionId) {
          const current = await stripe.subscriptions.retrieve(subscriptionId);
          if (!['canceled', 'incomplete_expired'].includes(current.status)) {
            const portal = await stripe.billingPortal.sessions.create({ customer, return_url: `${origin}/billing` });
            return NextResponse.json({ url: portal.url });
          }
        }
      }
    }
    // Recover an earlier API timeout after Stripe created a session but before we saved its ID.
    const openSessions = await stripe.checkout.sessions.list({ customer, status: 'open', limit: 100 });
    for (const open of openSessions.data) {
      if (open.metadata?.org_id !== orgId) continue;
      await stripe.checkout.sessions.expire(open.id);
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer, line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
      client_reference_id: orgId, metadata: { org_id: orgId, plan },
      subscription_data: { metadata: { org_id: orgId } },
      success_url: `${origin}/billing?checkout=success`, cancel_url: `${origin}/billing?checkout=cancelled`,
    }, { idempotencyKey: `panepilot-checkout-${orgId}-${token}` });
    sessionId = session.id;
    const { error: saveError } = await admin.from('billing_operations')
      .update({ checkout_session_id: sessionId }).eq('org_id', orgId);
    if (saveError) {
      await stripe.checkout.sessions.expire(session.id);
      throw new Error(saveError.message);
    }
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Could not prepare checkout', error);
    return NextResponse.json({ error: 'Could not prepare billing. Please try again.' }, { status: 502 });
  } finally {
    const { error } = await admin.rpc('release_billing_checkout', { target_org: orgId, token, session_id: sessionId });
    if (error) console.error('Could not release checkout lease', error);
  }
}
