import type { PlanId } from '@/lib/plans';

/**
 * Maps our plans to Stripe. Price IDs come from env so the same code works in
 * Stripe test mode and live mode. Amounts are informational (the real amount
 * lives on the Stripe Price); they drive the billing page display.
 */
export interface PaidPlan {
  id: Exclude<PlanId, 'trial'>;
  name: string;
  priceMonthly: number;
  priceEnvVar: string;
}

export const PAID_PLANS: PaidPlan[] = [
  { id: 'solo', name: 'Solo', priceMonthly: 79, priceEnvVar: 'STRIPE_PRICE_SOLO' },
  { id: 'crew', name: 'Crew', priceMonthly: 199, priceEnvVar: 'STRIPE_PRICE_CREW' },
  { id: 'franchise', name: 'Franchise', priceMonthly: 499, priceEnvVar: 'STRIPE_PRICE_FRANCHISE' },
];

/** Stripe price id for a plan, from env. Empty string if unconfigured. */
export function priceIdForPlan(plan: string): string {
  const p = PAID_PLANS.find((x) => x.id === plan);
  return p ? (process.env[p.priceEnvVar] ?? '') : '';
}

/** Resolve a Stripe price id back to our plan id (used by the webhook). */
export function planForPriceId(priceId: string): PlanId | null {
  for (const p of PAID_PLANS) {
    if (process.env[p.priceEnvVar] && process.env[p.priceEnvVar] === priceId) return p.id;
  }
  return null;
}

/** Is Stripe configured on the server (secret key present)? */
export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}
