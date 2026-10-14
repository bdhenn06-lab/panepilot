import type Stripe from 'stripe';
import { planForPriceId } from './plans';
export function subscriptionPlan(sub: Stripe.Subscription): string {
  if (!['active', 'trialing'].includes(sub.status)) return 'trial';
  const plan = planForPriceId(sub.items.data[0]?.price.id ?? '');
  if (!plan) throw new Error('Subscription has an unrecognized price');
  return plan;
}
export function customerIdOf(sub: Stripe.Subscription): string {
  return typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
}
