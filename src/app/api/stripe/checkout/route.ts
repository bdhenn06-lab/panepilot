import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import { priceIdForPlan, stripeConfigured } from '@/lib/stripe/plans';

export const runtime = 'nodejs';

/**
 * Creates a Stripe Checkout Session for the caller's org to subscribe to a
 * plan, and returns its URL. Auth required; only org admins may subscribe.
 * The org id is stored on the session (client_reference_id + metadata) so the
 * webhook can attribute the resulting subscription back to the org.
 */
export async function POST(request: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Billing is not enabled yet.' }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let plan: string;
  let orgId: string;
  try {
    const body = await request.json();
    plan = body.plan;
    orgId = body.orgId;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Verify the caller is an admin of the org they're subscribing.
  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const priceId = priceIdForPlan(plan);
  if (!priceId) {
    return NextResponse.json({ error: `No Stripe price configured for the ${plan} plan.` }, { status: 400 });
  }

  const { data: org } = await supabase.from('orgs').select('stripe_customer_id').eq('id', orgId).maybeSingle();
  const origin = new URL(request.url).origin;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: orgId,
    customer: org?.stripe_customer_id || undefined,
    customer_email: org?.stripe_customer_id ? undefined : user.email,
    metadata: { org_id: orgId, plan },
    subscription_data: { metadata: { org_id: orgId, plan } },
    success_url: `${origin}/billing?checkout=success`,
    cancel_url: `${origin}/billing?checkout=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
