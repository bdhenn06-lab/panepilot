/**
 * Billing plans — Stripe integration is stubbed behind a feature flag so
 * launch doesn't block on it. When NEXT_PUBLIC_BILLING_ENABLED=true the
 * billing page shows checkout buttons; wiring them to Stripe Checkout is the
 * only remaining step (orgs already carry plan + stripe_customer_id columns).
 */
export const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';

export interface Plan {
  id: 'solo' | 'crew' | 'franchise';
  name: string;
  priceMonthly: number;
  seats: string;
  blurb: string;
}

export const PLANS: Plan[] = [
  {
    id: 'solo',
    name: 'Solo',
    priceMonthly: 79,
    seats: '1 seat',
    blurb: 'One owner-operator working a county.',
  },
  {
    id: 'crew',
    name: 'Crew',
    priceMonthly: 199,
    seats: 'Up to 5 seats',
    blurb: 'A crew splitting the territory and the follow-up queue.',
  },
  {
    id: 'franchise',
    name: 'Franchise',
    priceMonthly: 499,
    seats: 'Unlimited seats',
    blurb: 'Multi-crew operations across counties.',
  },
];
