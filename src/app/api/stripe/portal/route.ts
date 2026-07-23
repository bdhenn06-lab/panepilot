import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import { stripeConfigured } from '@/lib/stripe/plans';

export const runtime = 'nodejs';

/**
 * Opens the Stripe customer billing portal so a subscribed org's admin can
 * update payment method, change plan, or cancel. Auth + admin required.
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

  let orgId: string;
  try {
    orgId = (await request.json()).orgId;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const { data: org } = await supabase.from('orgs').select('stripe_customer_id').eq('id', orgId).maybeSingle();
  if (!org?.stripe_customer_id) {
    return NextResponse.json({ error: 'No active subscription for this workspace.' }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${origin}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
